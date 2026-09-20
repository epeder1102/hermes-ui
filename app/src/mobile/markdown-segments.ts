export type Segment =
  | { code: string; kind: 'code'; language: string }
  | { kind: 'text'; text: string }

const FENCE_RE = /^([ \t]*)(`{3,}|~{3,})[ \t]*([^\s`]*)[ \t]*$/

/**
 * Split assistant text into prose and fenced code blocks.
 *
 * Not a markdown parser — the mobile shell renders prose as plain text today, so
 * the only structure that has to be recovered is the fence, because a code block
 * shown as literal backticks with collapsed indentation is unreadable on a
 * phone. Matches the closing fence on length and character so a ``` inside a
 * ~~~~ block does not terminate it early, and an unterminated fence keeps its
 * content as code rather than silently dropping the rest of the message.
 */
export function splitMarkdownSegments(input: string): Segment[] {
  const segments: Segment[] = []
  const lines = input.split('\n')

  let buffer: string[] = []
  let fence: { char: string; indent: string; language: string; length: number } | null = null
  let code: string[] = []

  const flushText = () => {
    const text = buffer.join('\n')

    if (text.trim()) {
      segments.push({ kind: 'text', text: text.replace(/^\n+|\n+$/g, '') })
    }

    buffer = []
  }

  const flushCode = () => {
    if (fence) {
      segments.push({ code: code.join('\n'), kind: 'code', language: fence.language })
    }

    code = []
    fence = null
  }

  for (const line of lines) {
    const match = FENCE_RE.exec(line)

    if (fence) {
      // A closing fence must use the same character and be at least as long as
      // the opening one, per CommonMark.
      if (match && match[2][0] === fence.char && match[2].length >= fence.length && !match[3]) {
        flushCode()

        continue
      }

      // Strip the opening fence's indentation from body lines so an indented
      // block does not render with phantom leading spaces.
      code.push(line.startsWith(fence.indent) ? line.slice(fence.indent.length) : line)

      continue
    }

    if (match) {
      flushText()
      fence = { char: match[2][0], indent: match[1], language: match[3] ?? '', length: match[2].length }

      continue
    }

    buffer.push(line)
  }

  // An unterminated fence still yields its content — dropping the tail of a
  // streaming reply would make partial output look like an empty card.
  if (fence) {
    flushCode()
  }

  flushText()

  return segments
}

/** Heuristic: does this fenced block look like a unified diff? */
export function looksLikeDiff(language: string, code: string): boolean {
  if (/^(diff|patch|udiff)$/i.test(language)) {
    return true
  }

  return /^@@+\s+-\d+(,\d+)?\s+\+\d+(,\d+)?\s+@@/m.test(code) || /^diff --git /m.test(code)
}
