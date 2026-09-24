import { describe, expect, it } from 'vitest'

import {
  buildLineOffsets,
  countTextLines,
  headTextLines,
  lineAt,
  PREVIEW_CHAR_BUDGET,
  tailTextLines,
  VIRTUAL_LINE_CHAR_BUDGET
} from './text-budget'

describe('mobile text budgets', () => {
  it('extracts bounded leading and trailing windows without splitting the full source', () => {
    const text = Array.from({ length: 10_000 }, (_, index) => `line-${index + 1}`).join('\n')
    const head = headTextLines(text, 120)
    const tail = tailTextLines(text, 200)

    expect(head.lineCount).toBe(10_000)
    expect(head.body.split('\n')).toHaveLength(120)
    expect(head.body).toContain('line-1')
    expect(head.body).not.toContain('line-121\n')
    expect(tail.body.split('\n')).toHaveLength(200)
    expect(tail.body).toContain('line-10000')
    expect(tail.body).not.toContain('line-9800\n')
  })

  it('caps pathological single-line previews and virtual rows by characters', () => {
    const text = 'x'.repeat(PREVIEW_CHAR_BUDGET * 2)
    const preview = headTextLines(text, 120)
    const offsets = buildLineOffsets(text)
    const row = lineAt(text, offsets, 0)

    expect(preview.body).toHaveLength(PREVIEW_CHAR_BUDGET)
    expect(preview.truncated).toBe(true)
    expect(row.length).toBeLessThan(VIRTUAL_LINE_CHAR_BUDGET + 80)
    expect(row).toContain('Copy includes full content')
  })

  it('handles empty, CRLF, trailing-newline, and missing-final-newline sources', () => {
    expect(countTextLines('')).toBe(0)
    expect(buildLineOffsets('')).toEqual([])

    const text = 'one\r\ntwo\r\n'
    const offsets = buildLineOffsets(text)

    expect(countTextLines(text)).toBe(3)
    expect(offsets).toHaveLength(3)
    expect(lineAt(text, offsets, 0)).toBe('one')
    expect(lineAt(text, offsets, 1)).toBe('two')
    expect(lineAt(text, offsets, 2)).toBe('')
    expect(lineAt('one\ntwo', buildLineOffsets('one\ntwo'), 1)).toBe('two')
  })
})
