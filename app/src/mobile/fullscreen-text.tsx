import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { countTextLines } from './text-budget'

interface FullscreenTextProps {
  followEnd?: boolean
  onClose: () => void
  text: string
  title: string
}

/**
 * A viewport-sized plain-text reader for content that is intentionally kept
 * out of the transcript and bottom-sheet DOM. The entire payload is one text
 * node rather than one element per line, so even a 10k-line result has a small
 * DOM and closing it restores the still-mounted sheet/transcript unchanged.
 */
export function FullscreenText({ followEnd = false, onClose, text, title }: FullscreenTextProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const onCloseRef = useRef(onClose)
  const scrollRef = useRef<HTMLPreElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const [copied, setCopied] = useState(false)
  const [pinned, setPinned] = useState(followEnd)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Capture before a parent bottom sheet sees Escape, so one keypress
        // closes only this topmost reader rather than both overlays.
        event.stopImmediatePropagation()
        onCloseRef.current()
      }
    }

    window.addEventListener('keydown', onKey, true)

    return () => {
      window.removeEventListener('keydown', onKey, true)
      restoreFocusRef.current?.focus()
    }
  }, [])

  useLayoutEffect(() => {
    if (followEnd && pinned && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [followEnd, pinned, text])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard permissions vary by WebView; this is a convenience action.
    }
  }

  return createPortal(
    <section
      aria-label={`${title} full screen`}
      aria-modal="true"
      role="dialog"
      style={{
        background: 'var(--background, #0b0b0c)',
        color: 'var(--foreground, #e7e7ea)',
        display: 'flex',
        flexDirection: 'column',
        inset: 0,
        position: 'fixed',
        zIndex: 1300
      }}
    >
      <header
        style={{
          alignItems: 'center',
          borderBottom: '1px solid var(--dt-border, #26262b)',
          display: 'flex',
          flex: '0 0 auto',
          gap: 8,
          minHeight: 56,
          padding:
            'max(6px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) 6px max(10px, env(safe-area-inset-left))'
        }}
      >
        <strong style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </strong>
        <span style={{ fontSize: 11, opacity: 0.5 }}>{countTextLines(text).toLocaleString()} lines</span>
        <button onClick={copy} style={actionButton} type="button">
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button onClick={onClose} ref={closeRef} style={actionButton} type="button">
          Close
        </button>
      </header>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <pre
          data-fullscreen-text
          onScroll={() => {
            const element = scrollRef.current

            if (element) {
              setPinned(element.scrollHeight - element.scrollTop - element.clientHeight < 32)
            }
          }}
          ref={scrollRef}
          style={{
            background: 'var(--midground, #0f0f11)',
            color: 'var(--foreground, #d4d4d8)',
            fontFamily: 'var(--dt-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
            fontSize: 12,
            height: '100%',
            lineHeight: 1.5,
            margin: 0,
            overflow: 'auto',
            padding:
              '12px max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))',
            whiteSpace: 'pre'
          }}
        >
          {text}
        </pre>

        {followEnd && !pinned && (
          <button
            aria-label="Jump to end of full output"
            onClick={() => {
              setPinned(true)

              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight
              }
            }}
            style={{
              ...actionButton,
              background: 'var(--dt-card, #17171a)',
              border: '1px solid var(--dt-border, #3a3a44)',
              borderRadius: 999,
              bottom: 'max(12px, env(safe-area-inset-bottom))',
              position: 'absolute',
              right: 'max(12px, env(safe-area-inset-right))'
            }}
            type="button"
          >
            Jump to end
          </button>
        )}
      </div>
    </section>,
    document.body
  )
}

const actionButton: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--dt-primary, #8ab4ff)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 12,
  minHeight: 44,
  padding: '6px 8px'
}
