import { useState } from 'react'

import { FullscreenText } from './fullscreen-text'
import { headTextLines } from './text-budget'

/** Lines shown before a fenced block is truncated behind "Show all". */
const LINE_BUDGET = 120

/**
 * A fenced code block from an assistant reply.
 *
 * The desktop renders these through a rich code card; on the phone that card
 * showed up empty during the first device test, and a code block that renders
 * nothing is worse than no card at all. This is deliberately dumb: a labelled
 * header, a copy button, and monospace text that scrolls horizontally instead of
 * wrapping.
 */
export function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false)
  const [fullScreen, setFullScreen] = useState(false)

  const preview = headTextLines(code, LINE_BUDGET)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard is permission-gated in a WebView; failing quietly is better
      // than an error toast for a convenience action.
    }
  }

  return (
    <>
      <div
      style={{
        border: '1px solid var(--dt-border, #26262b)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--midground, #0f0f11)'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          background: 'var(--dt-card, #17171a)',
          borderBottom: '1px solid var(--dt-border, #26262b)',
          fontSize: 11
        }}
      >
        <span style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{language || 'code'}</span>
        <span style={{ opacity: 0.4, marginLeft: 'auto' }}>{preview.lineCount.toLocaleString()} lines</span>
        <button
          onClick={copy}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--dt-primary, #8ab4ff)',
            font: 'inherit',
            fontSize: 12,
            minHeight: 32,
            padding: '0 4px',
            cursor: 'pointer'
          }}
          type="button"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <pre
        style={{
          margin: 0,
          padding: 10,
          maxHeight: '50vh',
          overflow: 'auto',
          // Horizontal scroll rather than wrapping: wrapped code loses its
          // indentation, which is most of what makes it scannable.
          whiteSpace: 'pre',
          fontSize: 12,
          lineHeight: 1.5,
          fontFamily: 'var(--dt-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
          color: 'var(--foreground, #d4d4d8)'
        }}
      >
        {preview.body}
      </pre>

      {preview.truncated && (
        <button
          onClick={() => setFullScreen(true)}
          style={{
            display: 'block',
            width: '100%',
            minHeight: 40,
            background: 'var(--dt-card, #17171a)',
            border: 'none',
            borderTop: '1px solid var(--dt-border, #26262b)',
            color: 'var(--dt-primary, #8ab4ff)',
            font: 'inherit',
            fontSize: 12,
            cursor: 'pointer'
          }}
          type="button"
        >
          Show all {preview.lineCount.toLocaleString()} lines
        </button>
      )}

      </div>

      {fullScreen && (
        <FullscreenText onClose={() => setFullScreen(false)} text={code} title={language ? `${language} code` : 'Code'} />
      )}
    </>
  )
}
