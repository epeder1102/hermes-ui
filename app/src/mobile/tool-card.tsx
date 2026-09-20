import { useStore } from '@nanostores/react'
import { useMemo, useState } from 'react'

import {
  buildToolView,
  formatDurationSeconds,
  type ToolPart,
  toolPartDisclosureId,
  type ToolStatus
} from '@/components/assistant-ui/tool/fallback-model'
import { useElapsedSeconds } from '@/components/chat/activity-timer'
import { $toolInlineDiff } from '@/store/tool-diffs'

import { ToolSheet } from './tool-sheet'

const STATUS_COLOR: Record<ToolStatus, string> = {
  error: '#ff6b6b',
  running: '#4aa3ff',
  success: '#4ade80',
  warning: '#fbbf24'
}

/**
 * Collapsed tool-call row.
 *
 * Always exactly one line: status dot, tool title, target, duration. Tapping it
 * opens a bottom sheet rather than growing inline — inline expansion inside a
 * scrolling transcript throws away the reader's scroll position on a phone,
 * which is the single worst mobile chat behaviour and the reason the plan
 * mandates a sheet.
 *
 * The view model comes from the desktop's `buildToolView`, so tool naming,
 * target extraction, stdout/stderr splitting and diff detection stay in one
 * place and mobile never drifts from desktop.
 */
export function ToolCard({ part, running }: { part: ToolPart; running: boolean }) {
  const [open, setOpen] = useState(false)

  const disclosureId = toolPartDisclosureId(part)
  const inlineDiff = useStore($toolInlineDiff(part.toolCallId ?? ''))

  // A part with no result while the message is still streaming is in flight.
  // Once the message stops, a result-less part is finished-with-no-output, not
  // stuck — same rule the desktop entry applies.
  const pending = running && part.result === undefined

  const view = useMemo(() => {
    const resolved = !pending && part.result === undefined ? { ...part, result: {} } : part

    return buildToolView(resolved, inlineDiff)
  }, [inlineDiff, part, pending])

  const elapsed = useElapsedSeconds(pending, `mobile-tool:${disclosureId}`)
  const duration = pending ? formatDurationSeconds(elapsed) : view.durationLabel

  return (
    <>
      <button
        // The visible title is human copy ("Ran a command"), which tells a
        // screen-reader user nothing about WHICH tool ran. The label names the
        // tool and its target explicitly, and its status, since the status is
        // otherwise carried only by a coloured dot.
        aria-label={[part.toolName, view.subtitle, pending ? 'running' : view.status].filter(Boolean).join(', ')}
        data-tool={part.toolName}
        onClick={() => setOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          minHeight: 44,
          padding: '8px 10px',
          background: 'var(--dt-card, #131316)',
          border: '1px solid var(--dt-border, #26262b)',
          borderRadius: 8,
          color: 'var(--foreground, #e7e7ea)',
          font: 'inherit',
          fontSize: 13,
          textAlign: 'left'
        }}
        type="button"
      >
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            flex: '0 0 auto',
            borderRadius: '50%',
            background: STATUS_COLOR[view.status],
            // A running tool pulses so an in-flight card is distinguishable at a
            // glance while scrolling past it.
            animation: pending ? 'hermes-pulse 1.2s ease-in-out infinite' : undefined
          }}
        />

        <span style={{ fontWeight: 600, flex: '0 0 auto' }}>{view.title}</span>

        {/* The target is the part most likely to overflow, so it is the only
            element allowed to ellipsize. Everything else keeps its full text. */}
        <span
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            opacity: 0.6,
            fontFamily: 'var(--dt-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
            fontSize: 12
          }}
        >
          {view.subtitle}
        </span>

        {view.countLabel && <span style={{ flex: '0 0 auto', opacity: 0.55, fontSize: 12 }}>{view.countLabel}</span>}
        {duration && <span style={{ flex: '0 0 auto', opacity: 0.5, fontSize: 12 }}>{duration}</span>}
        <span aria-hidden style={{ flex: '0 0 auto', opacity: 0.4 }}>
          ›
        </span>
      </button>

      {open && <ToolSheet onClose={() => setOpen(false)} pending={pending} view={view} />}
    </>
  )
}
