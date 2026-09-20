import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { ToolView } from '@/components/assistant-ui/tool/fallback-model'

import { DiffView } from './diff-view'

/** Lines rendered before the output is truncated behind "Show all". */
const LINE_BUDGET = 200

interface OutputBlockProps {
  label?: string
  /** Follow the tail as new content streams in (stdout of a running tool). */
  follow: boolean
  text: string
}

/**
 * A fixed-height, independently scrollable output region.
 *
 * Fixed height matters: letting tool output size the sheet means a long stdout
 * pushes the close affordance off-screen and the reader has to scroll the sheet
 * to get out of it. The region scrolls, the sheet does not grow.
 */
function OutputBlock({ follow, label, text }: OutputBlockProps) {
  const scrollRef = useRef<HTMLPreElement | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [pinned, setPinned] = useState(true)

  const lines = text.split('\n')
  const truncated = !showAll && lines.length > LINE_BUDGET
  const body = truncated ? lines.slice(-LINE_BUDGET).join('\n') : text

  // Follow the tail only while the reader has not scrolled away. Yanking them
  // back to the bottom mid-read is the reason "jump to end" exists as an
  // explicit control instead of an unconditional autoscroll.
  useLayoutEffect(() => {
    if (!follow || !pinned) {
      return
    }

    const el = scrollRef.current

    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [body, follow, pinned])

  const onScroll = () => {
    const el = scrollRef.current

    if (!el) {
      return
    }

    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 32)
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
      {label && (
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.5 }}>{label}</div>
      )}

      {truncated && (
        <button onClick={() => setShowAll(true)} style={linkBtn} type="button">
          Show all {lines.length} lines
        </button>
      )}

      <div style={{ position: 'relative', minHeight: 0 }}>
        <pre
          onScroll={onScroll}
          ref={scrollRef}
          style={{
            margin: 0,
            maxHeight: '38vh',
            overflow: 'auto',
            background: 'var(--midground, #0f0f11)',
            border: '1px solid var(--dt-border, #26262b)',
            borderRadius: 8,
            padding: 10,
            fontSize: 12,
            lineHeight: 1.5,
            fontFamily: 'var(--dt-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
            // No wrapping: wrapped terminal output and diffs are unreadable.
            // Horizontal scroll is the correct trade on a phone.
            whiteSpace: 'pre',
            color: 'var(--foreground, #d4d4d8)'
          }}
        >
          {body}
        </pre>

        {follow && !pinned && (
          <button
            onClick={() => {
              setPinned(true)

              const el = scrollRef.current

              if (el) {
                el.scrollTop = el.scrollHeight
              }
            }}
            style={{
              position: 'absolute',
              right: 10,
              bottom: 10,
              ...linkBtn,
              background: 'var(--dt-secondary, #2a2a31)',
              border: '1px solid var(--dt-border, #3a3a44)',
              borderRadius: 999,
              padding: '6px 12px'
            }}
            type="button"
          >
            Jump to end
          </button>
        )}
      </div>
    </section>
  )
}

/**
 * Bottom sheet holding one tool call's full output.
 *
 * Dismissable by backdrop tap and by Escape — unlike the approval sheet, which
 * deliberately is not (a tool result is informational; an approval is a
 * decision).
 */
export function ToolSheet({ onClose, pending, view }: { onClose: () => void; pending: boolean; view: ToolView }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const stdout = view.stdout ?? ''
  const stderr = view.stderr ?? ''
  const hasStreams = Boolean(stdout || stderr)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'flex-end'
      }}
    >
      <div
        onClick={event => event.stopPropagation()}
        style={{
          width: '100%',
          maxHeight: '88dvh',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          background: 'var(--dt-popover, #141417)',
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          border: '1px solid var(--dt-border, #26262b)',
          padding: 14,
          paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
          color: 'var(--foreground, #e7e7ea)'
        }}
      >
        <div aria-hidden style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--dt-border, #3a3a44)', alignSelf: 'center' }} />

        <header style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <strong style={{ fontSize: 15 }}>{view.title}</strong>
          {view.durationLabel && <span style={{ opacity: 0.5, fontSize: 12 }}>{view.durationLabel}</span>}
          <button onClick={onClose} style={{ ...linkBtn, marginLeft: 'auto', minHeight: 44 }} type="button">
            Close
          </button>
        </header>

        {/* The target is never middle-elided — on a phone the elided middle of a
            path or command is usually the part that matters. It scrolls instead. */}
        {view.subtitle && (
          <div
            style={{
              overflowX: 'auto',
              whiteSpace: 'nowrap',
              fontSize: 12,
              opacity: 0.7,
              fontFamily: 'var(--dt-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'
            }}
          >
            {view.subtitle}
          </div>
        )}

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          {view.inlineDiff && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.5 }}>Diff</div>
              <DiffView diff={view.inlineDiff} />
            </section>
          )}

          {hasStreams ? (
            <>
              {stdout && <OutputBlock follow={pending} label="stdout" text={stdout} />}
              {stderr && <OutputBlock follow={pending} label="stderr" text={stderr} />}
            </>
          ) : (
            view.detail && <OutputBlock follow={pending} label={view.detailLabel || 'Output'} text={view.detail} />
          )}

          {!view.inlineDiff && !hasStreams && !view.detail && (
            <p style={{ opacity: 0.5, fontSize: 13, margin: 0 }}>
              {pending ? 'Running…' : 'No output.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

const linkBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--dt-primary, #8ab4ff)',
  font: 'inherit',
  fontSize: 13,
  padding: '6px 0',
  cursor: 'pointer',
  alignSelf: 'flex-start'
}
