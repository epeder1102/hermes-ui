import { useStore } from '@nanostores/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { ToolPart } from '@/components/assistant-ui/tool/fallback-model'
import type { ChatMessage, ChatMessagePart } from '@/lib/chat-messages'
import { $activeGatewayProfile, $newChatProfile, normalizeProfileKey } from '@/store/profile'
import {
  $awaitingResponse,
  $busy,
  $gatewayState,
  $messages,
  $selectedStoredSessionId,
  $sessions
} from '@/store/session'

import { MobileApprovalSheet } from './approval-sheet'
import { CodeBlock } from './code-block'
import { DiffView } from './diff-view'
import { looksLikeDiff, splitMarkdownSegments } from './markdown-segments'
import { MobileComposer, useMobileViewportHeight } from './mobile-composer'
import { ProfileSheet } from './profile-sheet'
import { MobileSessionDrawer } from './session-drawer'
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
  const { cancelRun, refreshSessions, resumeSession, startFreshSessionDraft, submitText } = useChatEngine()
  useMobileViewportHeight()

  const messages = useStore($messages)
  const busy = useStore($busy)
  const awaiting = useStore($awaitingResponse)
  const gatewayState = useStore($gatewayState)
  const sessions = useStore($sessions)
  const selectedStoredSessionId = useStore($selectedStoredSessionId)

  const activeGatewayProfile = useStore($activeGatewayProfile)
  const newChatProfile = useStore($newChatProfile)
  const profile = normalizeProfileKey(newChatProfile ?? activeGatewayProfile)

  const [profileOpen, setProfileOpen] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)

  const ready = gatewayState === 'open'
  const selectedSession = sessions.find(session => session.id === selectedStoredSessionId)

  const conversationTitle =
    selectedSession?.title?.trim() || selectedSession?.preview?.trim().split('\n')[0] || 'New conversation'

  const connectionLabel = ready ? (busy ? 'Working' : awaiting ? 'Waiting for input' : 'Ready') : gatewayState

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        insetInline: 0,
        top: 'var(--mobile-viewport-offset-top, 0px)',
        height: 'var(--mobile-viewport-height, 100dvh)',
        overflow: 'hidden',
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
          padding:
            'calc(8px + env(safe-area-inset-top)) calc(10px + env(safe-area-inset-right)) 8px calc(10px + env(safe-area-inset-left))',
          borderBottom: '1px solid var(--dt-border, #26262b)',
          display: 'flex',
          flexShrink: 0,
          gap: 8,
          alignItems: 'center',
          minHeight: 62
        }}
      >
        <button
          aria-label="Open conversations"
          onClick={() => setSessionsOpen(true)}
          style={{
            alignItems: 'center',
            background: 'transparent',
            border: 0,
            color: 'var(--foreground, #e7e7ea)',
            display: 'flex',
            flex: 1,
            gap: 9,
            minHeight: 44,
            minWidth: 0,
            padding: '0 2px',
            textAlign: 'left'
          }}
          type="button"
        >
          <span
            aria-hidden="true"
            style={{
              alignItems: 'center',
              background: 'color-mix(in srgb, var(--foreground) 7%, transparent)',
              border: '1px solid color-mix(in srgb, var(--foreground) 10%, transparent)',
              borderRadius: 12,
              display: 'flex',
              flex: '0 0 42px',
              height: 42,
              justifyContent: 'center'
            }}
          >
            <MenuIcon />
          </span>
          <span style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <strong
              style={{ fontSize: 13, fontWeight: 760, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {conversationTitle}
            </strong>
            <span style={{ color: 'color-mix(in srgb, var(--foreground) 48%, transparent)', fontSize: 10 }}>
              {connectionLabel}
            </span>
          </span>
        </button>

        <button
          aria-label={`Profile: ${profile}. Change profile.`}
          onClick={() => setProfileOpen(true)}
          style={{
            ...btn,
            alignItems: 'center',
            display: 'flex',
            gap: 5,
            maxWidth: '29%',
            minHeight: 44,
            padding: '6px 9px'
          }}
          type="button"
        >
          <span style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {profile}
          </span>
          <span aria-hidden="true" style={{ opacity: 0.45 }}>
            ▾
          </span>
        </button>

        <button
          aria-label="New conversation"
          onClick={() => startFreshSessionDraft()}
          style={{ ...btn, alignItems: 'center', display: 'flex', justifyContent: 'center', padding: 0, width: 44 }}
          type="button"
        >
          <PlusIcon />
        </button>
      </header>

      <MobileMessageList busy={busy} messages={messages} sessionKey={selectedStoredSessionId ?? 'new-conversation'} />

      <MobileComposer busy={busy} onCancel={cancelRun} onSubmit={submitText} ready={ready} />

      <MobileSessionDrawer
        onClose={() => setSessionsOpen(false)}
        onNewSession={startFreshSessionDraft}
        onRefresh={refreshSessions}
        onResumeSession={resumeSession}
        onSwitchDesktop={() => switchShellMode('desktop')}
        open={sessionsOpen}
      />
      {profileOpen && <ProfileSheet onClose={() => setProfileOpen(false)} />}
      <MobileApprovalSheet />
    </div>
  )
}

const MESSAGE_ESTIMATE_PX = 160
const MESSAGE_OVERSCAN = 6
const BOTTOM_THRESHOLD_PX = 72

/**
 * A variable-height virtual transcript with one scroll owner.
 *
 * While the reader is at the bottom, new tokens and row remeasurement keep the
 * latest turn pinned. Scrolling up releases that lock, so a streaming response
 * cannot yank the reader away from history; the explicit button restores it.
 */
function MobileMessageList({
  busy,
  messages,
  sessionKey
}: {
  busy: boolean
  messages: ChatMessage[]
  sessionKey: string
}) {
  const scrollerRef = useRef<HTMLElement | null>(null)
  const followLatestRef = useRef(true)
  const [isAtBottom, setIsAtBottom] = useState(true)

  const virtualizer = useVirtualizer({
    count: messages.length,
    estimateSize: () => MESSAGE_ESTIMATE_PX,
    getItemKey: index => messages[index]?.id ?? index,
    getScrollElement: () => scrollerRef.current,
    initialOffset: Math.max(0, messages.length * MESSAGE_ESTIMATE_PX - 700),
    initialRect: { height: 700, width: 390 },
    overscan: MESSAGE_OVERSCAN
  })

  const scrollToLatest = useCallback(() => {
    followLatestRef.current = true
    setIsAtBottom(true)

    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' })
    }
  }, [messages.length, virtualizer])

  const updateBottomLock = useCallback(() => {
    const scroller = scrollerRef.current

    if (!scroller) {
      return
    }

    const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= BOTTOM_THRESHOLD_PX

    followLatestRef.current = atBottom
    setIsAtBottom(previous => (previous === atBottom ? previous : atBottom))
  }, [])

  // A session swap and initial history load should open at the newest turn.
  useEffect(() => {
    followLatestRef.current = true
    setIsAtBottom(true)
  }, [sessionKey])

  // Streaming text and asynchronously measured rich blocks can grow over
  // several frames. Pin until height settles, but only while the reader has
  // not deliberately escaped the bottom lock.
  useLayoutEffect(() => {
    if (!followLatestRef.current || messages.length === 0) {
      return
    }

    let frame = 0
    let lastHeight = -1
    let stableFrames = 0
    let rafId = 0

    const settle = () => {
      if (!followLatestRef.current) {
        return
      }

      scrollToLatest()

      const height = scrollerRef.current?.scrollHeight ?? 0

      stableFrames = height === lastHeight ? stableFrames + 1 : 0
      lastHeight = height

      if (stableFrames < 2 && frame++ < 12) {
        rafId = requestAnimationFrame(settle)
      }
    }

    rafId = requestAnimationFrame(settle)

    return () => cancelAnimationFrame(rafId)
  }, [messages, scrollToLatest, sessionKey])

  const measuredItems = virtualizer.getVirtualItems().map(item => ({ index: item.index, start: item.start }))
  // Before ResizeObserver reports the WebView viewport (and in jsdom, where it
  // never does), paint a small newest-first fallback instead of a blank frame.
  // The measured virtual window replaces this immediately on a real device.
  const fallbackStart = Math.max(0, messages.length - (MESSAGE_OVERSCAN * 2 + 1))

  const virtualItems =
    measuredItems.length > 0
      ? measuredItems
      : messages.slice(fallbackStart).map((_, offset) => {
          const index = fallbackStart + offset

          return { index, start: index * MESSAGE_ESTIMATE_PX }
        })

  return (
    <section style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      <main
        aria-label="Conversation messages"
        onScroll={updateBottomLock}
        ref={scrollerRef}
        role="log"
        style={{
          height: '100%',
          minHeight: 0,
          overflowX: 'hidden',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          padding: '14px calc(14px + env(safe-area-inset-right)) 14px calc(14px + env(safe-area-inset-left))'
        }}
      >
        {messages.length === 0 ? (
          <p style={{ opacity: 0.5 }}>No messages yet — send one below.</p>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualItems.map(virtualItem => {
              const message = messages[virtualItem.index]

              return message ? (
                <div
                  data-index={virtualItem.index}
                  data-message-index={virtualItem.index}
                  key={message.id}
                  ref={virtualizer.measureElement}
                  style={{
                    left: 0,
                    paddingBottom: 12,
                    position: 'absolute',
                    top: 0,
                    transform: `translateY(${virtualItem.start}px)`,
                    width: '100%'
                  }}
                >
                  <MobileMessage busy={busy} message={message} />
                </div>
              ) : null
            })}
          </div>
        )}
      </main>

      {!isAtBottom && messages.length > 0 && (
        <button
          aria-label="Jump to latest message"
          onClick={scrollToLatest}
          style={{
            ...btn,
            alignItems: 'center',
            background: 'var(--dt-card, #17171a)',
            borderRadius: 999,
            bottom: 12,
            boxShadow: '0 8px 24px color-mix(in srgb, #000 35%, transparent)',
            display: 'flex',
            fontSize: 12,
            gap: 6,
            left: '50%',
            minHeight: 44,
            padding: '8px 14px',
            position: 'absolute',
            transform: 'translateX(-50%)',
            zIndex: 2
          }}
          type="button"
        >
          <span aria-hidden="true">↓</span>
          Latest
        </button>
      )}
    </section>
  )
}

function MobileMessage({ busy, message }: { busy: boolean; message: ChatMessage }) {
  const blocks = blocksOf(message)
  const isUser = message.role === 'user'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
      <path d="M5 7h14M5 12h14M5 17h9" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
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
