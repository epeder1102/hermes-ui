import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { buildLineOffsets, lineAt } from './text-budget'

interface FullscreenTextProps {
  followEnd?: boolean
  onClose: () => void
  text: string
  title: string
}

interface HiddenSibling {
  ariaHidden: string | null
  element: HTMLElement
  inert: boolean
}

const LINE_HEIGHT = 18

/**
 * Viewport-sized, virtualized plain-text reader. The source string stays intact
 * for Copy while only visible line slices enter the DOM.
 */
export function FullscreenText({ followEnd = false, onClose, text, title }: FullscreenTextProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [copied, setCopied] = useState(false)
  const [pinned, setPinned] = useState(followEnd)
  const descriptionId = useId()
  const titleId = useId()
  const offsets = useMemo(() => buildLineOffsets(text), [text])
  const lineCount = offsets.length

  const virtualizer = useVirtualizer({
    count: lineCount,
    estimateSize: () => LINE_HEIGHT,
    getScrollElement: () => scrollRef.current,
    initialRect: { height: 640, width: 360 },
    overscan: 12
  })

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()

    const hidden: HiddenSibling[] = []

    for (const child of Array.from(document.body.children)) {
      if (!(child instanceof HTMLElement) || child === dialogRef.current || child.hasAttribute('data-mobile-approval')) {
        continue
      }

      hidden.push({ ariaHidden: child.getAttribute('aria-hidden'), element: child, inert: child.inert })
      child.inert = true
      child.setAttribute('aria-hidden', 'true')
    }

    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector('[data-mobile-approval]')) {
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        onCloseRef.current()

        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) {
        return
      }

      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]'))
      const first = controls[0]
      const last = controls.at(-1)

      if (!first || !last) {
        event.preventDefault()

        return
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey, true)

    return () => {
      window.removeEventListener('keydown', onKey, true)

      for (const item of hidden) {
        item.element.inert = item.inert

        if (item.ariaHidden === null) {
          item.element.removeAttribute('aria-hidden')
        } else {
          item.element.setAttribute('aria-hidden', item.ariaHidden)
        }
      }

      restoreFocusRef.current?.focus({ preventScroll: true })
    }
  }, [])

  useLayoutEffect(() => {
    if (followEnd && pinned && lineCount > 0) {
      virtualizer.scrollToIndex(lineCount - 1, { align: 'end' })
    }
  }, [followEnd, lineCount, pinned, text, virtualizer])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard permissions vary by WebView; this is a convenience action.
    }
  }

  const measuredRows = virtualizer.getVirtualItems()
  // ResizeObserver is absent in jsdom and can report a zero-height WebView on
  // the first frame. Keep that frame bounded and useful until measurement lands.
  const fallbackStart = followEnd ? Math.max(0, lineCount - 40) : 0

  const visibleRows =
    measuredRows.length > 0
      ? measuredRows
      : Array.from({ length: Math.min(40, lineCount) }, (_, offset) => {
          const index = fallbackStart + offset

          return { index, key: index, size: LINE_HEIGHT, start: index * LINE_HEIGHT }
        })

  const totalSize = Math.max(virtualizer.getTotalSize(), lineCount * LINE_HEIGHT)

  return createPortal(
    <section
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      ref={dialogRef}
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
        <strong
          id={titleId}
          style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {title} full screen
        </strong>
        <span id={descriptionId} style={{ fontSize: 11, opacity: 0.5 }}>
          {lineCount.toLocaleString()} lines; virtualized view
        </span>
        <button onClick={copy} style={actionButton} type="button">
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button onClick={onClose} ref={closeRef} style={actionButton} type="button">
          Close
        </button>
      </header>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div
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
            lineHeight: `${LINE_HEIGHT}px`,
            overflow: 'auto',
            overscrollBehavior: 'contain',
            padding:
              '12px max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))'
          }}
        >
          <div style={{ height: totalSize, minWidth: '100%', position: 'relative' }}>
            {visibleRows.map(item => (
              <div
                data-virtual-line
                key={item.key}
                style={{
                  height: item.size,
                  left: 0,
                  minWidth: '100%',
                  position: 'absolute',
                  top: 0,
                  transform: `translateY(${item.start}px)`,
                  whiteSpace: 'pre',
                  width: 'max-content'
                }}
              >
                {lineAt(text, offsets, item.index) || ' '}
              </div>
            ))}
          </div>
        </div>

        {followEnd && !pinned && (
          <button
            aria-label="Jump to end of full output"
            onClick={() => {
              setPinned(true)

              if (lineCount > 0) {
                virtualizer.scrollToIndex(lineCount - 1, { align: 'end' })
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
