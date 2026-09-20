import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { ToolPart } from '@/components/assistant-ui/tool/fallback-model'
import type { ChatMessage, ChatMessagePart } from '@/lib/chat-messages'
import { $awaitingResponse, $busy, $gatewayState, $messages } from '@/store/session'

import { CodeBlock } from './code-block'
import { DiffView } from './diff-view'
import { looksLikeDiff, splitMarkdownSegments } from './markdown-segments'
import { switchShellMode } from './shell-mode'
import { ToolCard } from './tool-card'
import { useChatEngine } from './use-chat-engine'

/** Text-bearing parts are concatenated; tool calls render as their own cards. */
function textOf(part: ChatMessagePart): string {
  if (typeof part === 'string') {
    return part
  }

  const p = part as { type?: string; text?: string }

  return p.type === 'text' || p.type === 'reasoning' ? (p.text ?? '') : ''
}

function isToolPart(part: ChatMessagePart): boolean {
  return typeof part !== 'string' && (part as { type?: string }).type === 'tool-call'
}

/**
 * Split a message into ordered blocks so tool cards keep their position in the
 * narrative instead of being hoisted to the top or bottom. Consecutive text
 * parts collapse into one bubble; each tool call is its own full-width card,
 * because a tool card nested inside a chat bubble has nowhere to put a
 * fixed-height scroll region.
 */
function blocksOf(message: ChatMessage): Array<{ key: string; kind: 'text'; text: string } | { key: string; kind: 'tool'; part: ToolPart }> {
  const blocks: Array<{ key: string; kind: 'text'; text: string } | { key: string; kind: 'tool'; part: ToolPart }> = []
  let buffer = ''

  const flush = (index: number) => {
    if (buffer.trim()) {
      blocks.push({ key: `${message.id}:t${index}`, kind: 'text', text: buffer.trimEnd() })
    }

    buffer = ''
  }

  message.parts.forEach((part, index) => {
    if (isToolPart(part)) {
      flush(index)
      blocks.push({ key: `${message.id}:tool${index}`, kind: 'tool', part: part as unknown as ToolPart })

      return
    }

    const text = textOf(part)

    if (text) {
      buffer += (buffer ? '\n' : '') + text
    }
  })

  flush(message.parts.length)

  return blocks
}

/**
 * P4 probe shell — deliberately unstyled and feature-free.
 *
 * Its only job is to answer the kill criterion on real hardware: mount the
 * message stream + composer in a standalone route, driven entirely by the
 * existing stores, with zero store edits. Tool cards, diffs, approval sheets
 * and the real composer land on top of this engine once the answer is yes.
 */
export function MobileApp() {
  const { cancelRun, startFreshSessionDraft, submitText } = useChatEngine()

  const messages = useStore($messages)
  const busy = useStore($busy)
  const awaiting = useStore($awaitingResponse)
  const gatewayState = useStore($gatewayState)

  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // scrollIntoView is missing in jsdom and in some older Android WebViews.
    endRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages])

  const ready = gatewayState === 'open'

  const send = () => {
    const text = draft.trim()

    if (!text || !ready) {
      return
    }

    setDraft('')
    void submitText(text)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        background: 'var(--background, #0b0b0c)',
        color: 'var(--foreground, #e7e7ea)',
        fontFamily: 'var(--dt-font-sans, system-ui, sans-serif)'
      }}
    >
      {/* Scoped keyframes for the running-tool pulse. Inline so the mobile shell
          stays self-contained and does not depend on the desktop stylesheet. */}
      <style>{'@keyframes hermes-pulse{0%,100%{opacity:1}50%{opacity:.35}}'}</style>

      <header
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--dt-border, #26262b)',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          fontSize: 13
        }}
      >
        <strong style={{ fontSize: 14 }}>Hermes mobile</strong>
        <span style={{ opacity: 0.65 }}>
          gateway: {gatewayState}
          {busy ? ' · busy' : ''}
          {awaiting ? ' · awaiting' : ''}
        </span>
        <button onClick={() => startFreshSessionDraft()} style={{ marginLeft: 'auto', ...btn }} type="button">
          New
        </button>

        {/* The only way back to the desktop shell from inside the APK, which has
            no address bar to append ?m=0 to. */}
        <button
          onClick={() => switchShellMode('desktop')}
          style={{ ...btn, padding: '10px 10px', opacity: 0.75 }}
          title="Switch to the desktop layout"
          type="button"
        >
          Desktop
        </button>
      </header>

      <main style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && <p style={{ opacity: 0.5 }}>No messages yet — send one below.</p>}

        {messages.map(message => {
          const blocks = blocksOf(message)
          const isUser = message.role === 'user'

          return (
            <div key={message.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {blocks.map(block =>
                block.kind === 'tool' ? (
                  <ToolCard key={block.key} part={block.part} running={busy} />
                ) : (
                  <MessageText isUser={isUser} key={block.key} text={block.text} />
                )
              )}

              {blocks.length === 0 && !message.error && (
                <em style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', opacity: 0.4, fontSize: 12 }}>
                  {message.pending ? '…' : '(no content)'}
                </em>
              )}

              {message.error && (
                <div style={{ color: 'var(--dt-destructive, #ff8383)', fontSize: 13, alignSelf: 'flex-start' }}>{message.error}</div>
              )}
            </div>
          )
        })}

        <div ref={endRef} />
      </main>

      <footer
        style={{
          display: 'flex',
          gap: 8,
          padding: 10,
          paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
          borderTop: '1px solid var(--dt-border, #26262b)'
        }}
      >
        <textarea
          disabled={!ready}
          onChange={event => setDraft(event.target.value)}
          placeholder={ready ? 'Message Hermes…' : 'Connecting…'}
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            background: 'var(--dt-card, #131316)',
            color: 'inherit',
            border: '1px solid var(--dt-border, #2c2c33)',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 16,
            fontFamily: 'inherit',
            maxHeight: 120
          }}
          value={draft}
        />
        {busy ? (
          <button onClick={() => void cancelRun()} style={{ ...btn, minWidth: 68 }} type="button">
            Stop
          </button>
        ) : (
          <button disabled={!ready || !draft.trim()} onClick={send} style={{ ...btn, minWidth: 68 }} type="button">
            Send
          </button>
        )}
      </footer>
    </div>
  )
}

/**
 * One prose block from a message.
 *
 * Fenced code is lifted OUT of the chat bubble and rendered full-width: a code
 * block inside an 85%-wide bubble has no room to scroll horizontally, which is
 * the whole mechanism that keeps code readable here. A fenced block that is
 * actually a unified diff is routed to the diff renderer instead, so a patch
 * pasted into a reply reads the same as a patch produced by a tool.
 */
function MessageText({ isUser, text }: { isUser: boolean; text: string }) {
  const segments = useMemo(() => splitMarkdownSegments(text), [text])

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.kind === 'code') {
          return looksLikeDiff(segment.language, segment.code) ? (
            <DiffView diff={segment.code} key={index} />
          ) : (
            <CodeBlock code={segment.code} key={index} language={segment.language} />
          )
        }

        return (
          <article
            key={index}
            style={{
              alignSelf: isUser ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              background: isUser
                ? 'color-mix(in srgb, var(--dt-primary, #4a7fd0) 16%, var(--dt-card, #17171a))'
                : 'var(--dt-card, #17171a)',
              border: '1px solid var(--dt-border, #26262b)',
              borderRadius: 10,
              padding: '8px 10px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 14,
              lineHeight: 1.45
            }}
          >
            {segment.text}
          </article>
        )
      })}
    </>
  )
}

const btn: React.CSSProperties = {
  background: 'var(--dt-secondary, #2a2a31)',
  color: 'var(--foreground, #e7e7ea)',
  border: '1px solid var(--dt-border, #3a3a44)',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 14,
  minHeight: 44
}

export default MobileApp
