import { useMemo, useState } from 'react'

import { type DiffFile, type DiffHunk, parseUnifiedDiff } from './diff-model'
import { FullscreenText } from './fullscreen-text'
import { countTextLines, truncateVisualLine } from './text-budget'

/** Hunks bigger than this start collapsed, even when the file is small. */
const BIG_HUNK_LINES = 60
/** Maximum styled line rows mounted for one expanded hunk. */
const HUNK_PREVIEW_LINES = 160
/** Global summary limits keep many-file/many-hunk diffs bounded before opening full screen. */
const FILE_PREVIEW_LIMIT = 20
const HUNK_CONTROL_LIMIT = 40
/** Above this many total changed lines, every hunk starts collapsed. */
const AUTO_COLLAPSE_TOTAL = 200

const KIND_STYLE: Record<string, { background?: string; color?: string; gutter: string }> = {
  add: { background: 'color-mix(in srgb, #22c55e 14%, transparent)', gutter: '#22c55e' },
  context: { gutter: 'transparent' },
  meta: { color: 'var(--dt-muted-foreground, #8a8a93)', gutter: 'transparent' },
  remove: { background: 'color-mix(in srgb, #f43f5e 14%, transparent)', gutter: '#f43f5e' }
}

function HunkBody({ hunk }: { hunk: DiffHunk }) {
  return (
    <div
      style={{
        // One scroll container per hunk, not per line: the whole hunk shifts
        // together horizontally so a long line cannot desynchronise from the
        // lines around it, which makes a diff impossible to read.
        overflowX: 'auto',
        background: 'var(--midground, #0f0f11)'
      }}
    >
      <div style={{ minWidth: 'max-content', fontSize: 12, lineHeight: 1.55 }}>
        {hunk.lines.map((line, index) => {
          const style = KIND_STYLE[line.kind] ?? KIND_STYLE.context

          return (
            <div
              data-diff-line
              key={index}
              style={{
                display: 'flex',
                background: style.background,
                borderLeft: `2px solid ${style.gutter}`,
                color: style.color
              }}
            >
              <span
                aria-hidden
                style={{
                  flex: '0 0 auto',
                  width: 34,
                  paddingRight: 8,
                  textAlign: 'right',
                  opacity: 0.35,
                  userSelect: 'none'
                }}
              >
                {line.kind === 'add' ? line.newNo : line.kind === 'remove' ? line.oldNo : line.newNo}
              </span>

              <span aria-hidden style={{ flex: '0 0 auto', width: 12, opacity: 0.6, userSelect: 'none' }}>
                {line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}
              </span>

              {/* No wrapping, ever. A wrapped diff loses the alignment that makes
                  it readable; the hunk scrolls horizontally instead. */}
              <span style={{ whiteSpace: 'pre', paddingRight: 12 }}>{truncateVisualLine(line.text) || ' '}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface FileDiffProps {
  file: DiffFile
  fileIndex: number
  onToggleHunk: (key: string) => void
  onViewAll: () => void
  openHunkKey: string | null
}

function FileDiff({ file, fileIndex, onToggleHunk, onViewAll, openHunkKey }: FileDiffProps) {
  return (
    <section style={{ border: '1px solid var(--dt-border, #26262b)', borderRadius: 8, overflow: 'hidden' }}>
      {/* Sticky so the filename stays visible while scrolling a long diff —
          on a phone it is otherwise very easy to lose track of which file the
          hunk on screen belongs to. */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          background: 'var(--dt-card, #17171a)',
          borderBottom: '1px solid var(--dt-border, #26262b)',
          fontSize: 12
        }}
      >
        <strong
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            direction: 'rtl',
            textAlign: 'left',
            fontFamily: 'var(--dt-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'
          }}
          title={file.path}
        >
          {/* rtl truncation keeps the FILENAME visible and elides the directory
              prefix, which is the opposite of what ellipsis does by default and
              is what actually matters when scanning a diff. */}
          {file.path || 'diff'}
        </strong>

        {file.added > 0 && <span style={{ color: '#4ade80', flex: '0 0 auto' }}>+{file.added}</span>}
        {file.removed > 0 && <span style={{ color: '#f87171', flex: '0 0 auto' }}>−{file.removed}</span>}
      </header>

      {file.hunks.map((hunk, index) => {
        const hunkKey = `${fileIndex}:${index}`

        return (
          <Hunk
            hunk={hunk}
            key={hunkKey}
            onToggle={() => onToggleHunk(hunkKey)}
            onViewAll={onViewAll}
            open={openHunkKey === hunkKey}
          />
        )
      })}
    </section>
  )
}

function Hunk({ hunk, onToggle, onViewAll, open }: { hunk: DiffHunk; onToggle: () => void; onViewAll: () => void; open: boolean }) {
  const previewed = hunk.lines.length > HUNK_PREVIEW_LINES
  const visibleHunk = previewed ? { ...hunk, lines: hunk.lines.slice(0, HUNK_PREVIEW_LINES) } : hunk

  const label = hunk.section || hunk.header || `${hunk.lines.length} lines`

  return (
    <>
      <button
        aria-expanded={open}
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          minHeight: 40,
          padding: '6px 10px',
          background: 'transparent',
          border: 'none',
          borderTop: '1px solid var(--dt-border, #26262b)',
          color: 'var(--foreground, #e7e7ea)',
          font: 'inherit',
          fontSize: 12,
          textAlign: 'left',
          cursor: 'pointer'
        }}
        type="button"
      >
        <span aria-hidden style={{ opacity: 0.5, width: 10 }}>
          {open ? '▾' : '▸'}
        </span>
        <span
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            opacity: 0.7,
            fontFamily: 'var(--dt-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'
          }}
        >
          {label}
        </span>
        {hunk.added > 0 && <span style={{ color: '#4ade80' }}>+{hunk.added}</span>}
        {hunk.removed > 0 && <span style={{ color: '#f87171' }}>−{hunk.removed}</span>}
      </button>

      {open && (
        <>
          <HunkBody hunk={visibleHunk} />
          {previewed && (
            <button onClick={onViewAll} style={fullDiffButton} type="button">
              Show all {hunk.lines.length.toLocaleString()} hunk lines full screen
            </button>
          )}
        </>
      )}
    </>
  )
}

/**
 * Mobile diff renderer: per-file sticky header, per-hunk collapse, no wrapping.
 *
 * Deliberately plain monospace with tinted add/remove rows rather than syntax
 * highlighting. The plan allows a strict highlight budget that "bails to plain
 * mono rather than janking"; on a phone, for a diff, the tint and alignment
 * carry almost all the signal and highlighting is what would jank. Revisit only
 * if reading diffs actually feels worse than it does on desktop.
 */
export function DiffView({ diff }: { diff: string }) {
  const [fullScreen, setFullScreen] = useState(false)
  const [selectedHunkKey, setSelectedHunkKey] = useState<string | null | undefined>(undefined)
  const files = useMemo(() => parseUnifiedDiff(diff), [diff])

  const total = useMemo(() => files.reduce((sum, file) => sum + file.added + file.removed, 0), [files])
  const lineCount = useMemo(() => countTextLines(diff), [diff])
  const hunkCount = useMemo(() => files.reduce((sum, file) => sum + file.hunks.length, 0), [files])
  const collapseByDefault = total > AUTO_COLLAPSE_TOTAL || lineCount > AUTO_COLLAPSE_TOTAL
  const firstHunk = files[0]?.hunks[0]
  const defaultOpenHunkKey = !collapseByDefault && firstHunk && firstHunk.lines.length <= BIG_HUNK_LINES ? '0:0' : null
  const openHunkKey = selectedHunkKey === undefined ? defaultOpenHunkKey : selectedHunkKey

  const previewFiles = useMemo(() => {
    let remainingHunks = HUNK_CONTROL_LIMIT

    return files.slice(0, FILE_PREVIEW_LIMIT).flatMap((file, fileIndex) => {
      if (remainingHunks <= 0) {
        return []
      }

      const hunks = file.hunks.slice(0, remainingHunks)
      remainingHunks -= hunks.length

      return hunks.length > 0 ? [{ file: { ...file, hunks }, fileIndex }] : []
    })
  }, [files])

  const shownHunks = previewFiles.reduce((sum, item) => sum + item.file.hunks.length, 0)
  const omittedFiles = Math.max(0, files.length - previewFiles.length)
  const omittedHunks = Math.max(0, hunkCount - shownHunks)

  if (files.length === 0) {
    return null
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
          <span style={{ fontSize: 11, opacity: 0.55 }}>{lineCount.toLocaleString()} diff lines</span>
          <button onClick={() => setFullScreen(true)} style={{ ...fullDiffButton, marginLeft: 'auto' }} type="button">
            Full screen
          </button>
        </div>

        {collapseByDefault && (
          <p style={{ margin: 0, fontSize: 11, opacity: 0.55 }}>
            Large diff ({lineCount.toLocaleString()} physical lines, {total} changed) — hunks start collapsed.
          </p>
        )}

        {previewFiles.map(({ file, fileIndex }) => (
          <FileDiff
            file={file}
            fileIndex={fileIndex}
            key={`${file.path}:${fileIndex}`}
            onToggleHunk={key => setSelectedHunkKey(current => (current === key ? null : key))}
            onViewAll={() => setFullScreen(true)}
            openHunkKey={openHunkKey}
          />
        ))}

        {(omittedFiles > 0 || omittedHunks > 0) && (
          <button onClick={() => setFullScreen(true)} style={fullDiffButton} type="button">
            Open full diff — {omittedFiles.toLocaleString()} more files, {omittedHunks.toLocaleString()} more hunks
          </button>
        )}
      </div>

      {fullScreen && <FullscreenText onClose={() => setFullScreen(false)} text={diff} title="Diff" />}
    </>
  )
}

const fullDiffButton: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--dt-primary, #8ab4ff)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 12,
  minHeight: 44,
  padding: '6px 8px'
}
