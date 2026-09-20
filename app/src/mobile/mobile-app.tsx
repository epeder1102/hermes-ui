import { useStore } from '@nanostores/react'
import { useEffect, useRef, useState } from 'react'

import { $awaitingResponse, $busy, $gatewayState, $messages } from '@/store/session'

import { useChatEngine } from './use-chat-engine'

/** Flatten a ChatMessage's parts down to plain text for the probe renderer. */
function partsToText(parts: unknown[]): string {
  return parts
    .map(part => {
      if (typeof part === 'string') {
        return part
      }

      const p = part as { type?: string; text?: string; toolName?: string }

      if (p.type === 'text' || p.type === 'reasoning') {
        return p.text ?? ''
      }

      if (p.type === 'tool-call') {
        return `[tool: ${p.toolName ?? 'unknown'}]`
      }

      return ''
    })
    .filter(Boolean)
    .join('\n')
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
        background: '#0b0b0c',
        color: '#e7e7ea',
        fontFamily: 'system-ui, sans-serif'
      }}
    >
      <header
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid #26262b',
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
      </header>

      <main style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && <p style={{ opacity: 0.5 }}>No messages yet — send one below.</p>}

        {messages.map(message => (
          <article
            key={message.id}
            style={{
              alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              background: message.role === 'user' ? '#1d3b63' : '#17171a',
              border: '1px solid #26262b',
              borderRadius: 10,
              padding: '8px 10px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 14,
              lineHeight: 1.45
            }}
          >
            <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 4 }}>{message.role}</div>
            {partsToText(message.parts as unknown[]) || <em style={{ opacity: 0.5 }}>(no text parts)</em>}
            {message.error && <div style={{ color: '#ff8383', marginTop: 6 }}>{message.error}</div>}
          </article>
        ))}

        <div ref={endRef} />
      </main>

      <footer
        style={{
          display: 'flex',
          gap: 8,
          padding: 10,
          paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
          borderTop: '1px solid #26262b'
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
            background: '#131316',
            color: 'inherit',
            border: '1px solid #2c2c33',
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

const btn: React.CSSProperties = {
  background: '#2a2a31',
  color: '#e7e7ea',
  border: '1px solid #3a3a44',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 14,
  minHeight: 44
}

export default MobileApp
