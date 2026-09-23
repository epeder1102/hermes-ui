export interface TextPreview {
  body: string
  lineCount: number
  truncated: boolean
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

export function headTextLines(text: string, budget: number): TextPreview {
  const lineCount = countTextLines(text)

  if (lineCount <= budget) {
    return { body: text, lineCount, truncated: false }
  }

  let newlines = 0
  let end = text.length

  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10 && ++newlines === budget) {
      end = index

      break
    }
  }

  return { body: text.slice(0, end), lineCount, truncated: true }
}

export function tailTextLines(text: string, budget: number): TextPreview {
  const lineCount = countTextLines(text)

  if (lineCount <= budget) {
    return { body: text, lineCount, truncated: false }
  }

  let newlines = 0
  let start = 0

  for (let index = text.length - 1; index >= 0; index -= 1) {
    if (text.charCodeAt(index) === 10 && ++newlines === budget) {
      start = index + 1

      break
    }
  }

  return { body: text.slice(start), lineCount, truncated: true }
}
