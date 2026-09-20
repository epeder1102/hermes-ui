export type DiffLineKind = 'add' | 'context' | 'meta' | 'remove'

export interface DiffLine {
  kind: DiffLineKind
  newNo?: number
  oldNo?: number
  text: string
}

export interface DiffHunk {
  added: number
  /** The raw `@@ -a,b +c,d @@ trailing` line, minus the trailing section text. */
  header: string
  lines: DiffLine[]
  removed: number
  /** The function/section name git puts after the closing `@@`, when present. */
  section: string
}

export interface DiffFile {
  added: number
  hunks: DiffHunk[]
  path: string
  removed: number
}

const HUNK_RE = /^@@+\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@+(.*)$/

/**
 * Parse a unified diff into files → hunks → lines.
 *
 * The desktop's `parseDiff` returns a flat `DiffLine[]`, which cannot express
 * per-hunk collapse — the single most useful affordance on a phone, where a
 * 12-hunk diff is otherwise an unnavigable wall. Hence a parser here rather than
 * reusing that one. `countDiffLineStats` semantics are matched exactly (`+++`
 * and `---` are headers, not changes) so mobile counts never disagree with the
 * numbers the desktop shows.
 *
 * Tolerant by design: tool output is not always a well-formed git diff. A diff
 * with no `diff --git`/`---`/`+++` headers still parses into one unnamed file,
 * and content before the first `@@` becomes a leading hunk so nothing is
 * silently dropped.
 */
export function parseUnifiedDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = []

  let file: DiffFile | null = null
  let hunk: DiffHunk | null = null
  let oldNo = 0
  let newNo = 0

  const ensureFile = (path = '') => {
    if (!file) {
      file = { added: 0, hunks: [], path, removed: 0 }
      files.push(file)
    } else if (path && !file.path) {
      file.path = path
    }

    return file
  }

  // Content that appears before any `@@` (a bare diff body, or trailing notes)
  // still needs somewhere to live, or it would vanish from the rendered view.
  const ensureHunk = () => {
    if (!hunk) {
      hunk = { added: 0, header: '', lines: [], removed: 0, section: '' }
      ensureFile().hunks.push(hunk)
    }

    return hunk
  }

  for (const raw of diff.split('\n')) {
    const gitHeader = /^diff --git a\/(.+?) b\/(.+)$/.exec(raw)

    if (gitHeader) {
      file = null
      hunk = null
      ensureFile(gitHeader[2] || gitHeader[1])

      continue
    }

    if (raw.startsWith('+++ ')) {
      const path = raw.slice(4).replace(/^b\//, '').trim()

      if (path && path !== '/dev/null') {
        ensureFile(path).path = path
      }

      continue
    }

    // `--- a/x` is a header, not a removal. Checked before the '-' branch below.
    if (raw.startsWith('--- ')) {
      ensureFile()

      continue
    }

    if (raw.startsWith('index ') || raw.startsWith('new file mode') || raw.startsWith('deleted file mode')) {
      continue
    }

    const hunkMatch = HUNK_RE.exec(raw)

    if (hunkMatch) {
      oldNo = Number(hunkMatch[1])
      newNo = Number(hunkMatch[3])
      hunk = {
        added: 0,
        header: raw.slice(0, raw.indexOf('@@', 2) + 2),
        lines: [],
        removed: 0,
        section: (hunkMatch[5] ?? '').trim()
      }
      ensureFile().hunks.push(hunk)

      continue
    }

    // "\ No newline at end of file" — metadata, never a content line.
    if (raw.startsWith('\\')) {
      ensureHunk().lines.push({ kind: 'meta', text: raw })

      continue
    }

    const current = ensureHunk()

    if (raw.startsWith('+')) {
      current.lines.push({ kind: 'add', newNo, text: raw.slice(1) })
      current.added += 1
      ensureFile().added += 1
      newNo += 1

      continue
    }

    if (raw.startsWith('-')) {
      current.lines.push({ kind: 'remove', oldNo, text: raw.slice(1) })
      current.removed += 1
      ensureFile().removed += 1
      oldNo += 1

      continue
    }

    current.lines.push({ kind: 'context', newNo, oldNo, text: raw.startsWith(' ') ? raw.slice(1) : raw })
    oldNo += 1
    newNo += 1
  }

  // Drop a trailing empty hunk produced by the final newline.
  for (const entry of files) {
    entry.hunks = entry.hunks.filter(h => h.lines.some(line => line.text.trim()) || h.header)
  }

  return files.filter(entry => {
    if (entry.hunks.length === 0) {
      return false
    }

    // Prose is not a diff. Without this, any string at all parses into a
    // single context-only "file" — the tolerant `ensureHunk` path that exists
    // so a headerless diff body is not dropped would happily swallow a
    // sentence and render it as an empty diff panel. A real diff has either a
    // hunk header or at least one +/- line.
    return entry.hunks.some(h => h.header || h.added > 0 || h.removed > 0)
  })
}

/** `src/app/very/long/path/file.ts` → `file.ts`, for the sticky header. */
export function basename(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)

  return parts[parts.length - 1] ?? path
}
