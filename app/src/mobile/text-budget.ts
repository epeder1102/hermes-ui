export const PREVIEW_CHAR_BUDGET = 64 * 1024
export const VIRTUAL_LINE_CHAR_BUDGET = 16 * 1024

export interface TextPreview {
  body: string
  lineCount: number
  truncated: boolean
}

export function buildLineOffsets(text: string): number[] {
  if (!text) {
    return []
  }

  const offsets = [0]

  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      offsets.push(index + 1)
    }
  }

  return offsets
}

export function countTextLines(text: string): number {
  if (!text) {
    return 0
  }

  let count = 1

  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      count += 1
    }
  }

  return count
}

export function lineAt(text: string, offsets: number[], index: number, maxChars = VIRTUAL_LINE_CHAR_BUDGET): string {
  const start = offsets[index]

  if (start === undefined) {
    return ''
  }

  const next = offsets[index + 1]
  const end = next === undefined ? text.length : next - 1
  const visibleEnd = Math.min(end, start + maxChars)
  const line = text.slice(start, visibleEnd).replace(/\r$/, '')

  return visibleEnd < end ? `${line} … [line truncated visually; Copy includes full content]` : line
}

export function headTextLines(text: string, budget: number, maxChars = PREVIEW_CHAR_BUDGET): TextPreview {
  const lineCount = countTextLines(text)

  if (!text) {
    return { body: '', lineCount, truncated: false }
  }

  let newlines = 0
  let end = text.length

  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10 && ++newlines === budget) {
      end = index

      break
    }
  }

  end = Math.min(end, maxChars)

  return { body: text.slice(0, end), lineCount, truncated: end < text.length }
}

export function tailTextLines(text: string, budget: number, maxChars = PREVIEW_CHAR_BUDGET): TextPreview {
  const lineCount = countTextLines(text)

  if (!text) {
    return { body: '', lineCount, truncated: false }
  }

  let newlines = 0
  let start = 0

  for (let index = text.length - 1; index >= 0; index -= 1) {
    if (text.charCodeAt(index) === 10 && ++newlines === budget) {
      start = index + 1

      break
    }
  }

  start = Math.max(start, text.length - maxChars)

  return { body: text.slice(start), lineCount, truncated: start > 0 }
}
