import { describe, expect, it } from 'vitest'

import { basename, parseUnifiedDiff } from './diff-model'
import { looksLikeDiff, splitMarkdownSegments } from './markdown-segments'

const GIT_DIFF = `diff --git a/src/app.ts b/src/app.ts
index 1234567..89abcde 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,7 +10,8 @@ export function boot() {
 const a = 1
-const b = 2
+const b = 3
+const c = 4
 return a
@@ -40,3 +41,3 @@ function tail() {
-old tail
+new tail
 done`

describe('parseUnifiedDiff', () => {
  it('groups a git diff into a file with its hunks', () => {
    const [file] = parseUnifiedDiff(GIT_DIFF)

    expect(file.path).toBe('src/app.ts')
    expect(file.hunks).toHaveLength(2)
    expect(file.added).toBe(3)
    expect(file.removed).toBe(2)
  })

  it('keeps the section name git puts after the closing @@', () => {
    const [file] = parseUnifiedDiff(GIT_DIFF)

    expect(file.hunks[0].section).toBe('export function boot() {')
    expect(file.hunks[1].section).toBe('function tail() {')
  })

  it('does not count --- / +++ headers as changed lines', () => {
    // The regression this guards: treating the file headers as a remove/add
    // pair inflates every single-file diff by one line each way, and mobile
    // would then disagree with the counts desktop shows.
    const [file] = parseUnifiedDiff(GIT_DIFF)

    expect(file.added + file.removed).toBe(5)
  })

  it('tracks line numbers down each side independently', () => {
    const [file] = parseUnifiedDiff(GIT_DIFF)
    const first = file.hunks[0].lines

    expect(first[0]).toMatchObject({ kind: 'context', oldNo: 10, newNo: 10 })
    expect(first[1]).toMatchObject({ kind: 'remove', oldNo: 11 })
    expect(first[2]).toMatchObject({ kind: 'add', newNo: 11 })
  })

  it('parses a bare hunk with no file headers', () => {
    const files = parseUnifiedDiff('@@ -1,2 +1,2 @@\n-a\n+b\n')

    expect(files).toHaveLength(1)
    expect(files[0].added).toBe(1)
    expect(files[0].removed).toBe(1)
  })

  it('treats "\\ No newline at end of file" as metadata, not a removal', () => {
    const [file] = parseUnifiedDiff('@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file')

    expect(file.removed).toBe(1)
    expect(file.hunks[0].lines.some(line => line.kind === 'meta')).toBe(true)
  })

  it('returns nothing for text that is not a diff', () => {
    expect(parseUnifiedDiff('just a sentence')).toHaveLength(0)
  })
})

describe('basename', () => {
  it('reduces a path to its filename', () => {
    expect(basename('src/app/very/long/file.ts')).toBe('file.ts')
    expect(basename('file.ts')).toBe('file.ts')
  })
})

describe('splitMarkdownSegments', () => {
  it('separates prose from a fenced block', () => {
    const segments = splitMarkdownSegments('before\n```ts\nconst a = 1\n```\nafter')

    expect(segments).toEqual([
      { kind: 'text', text: 'before' },
      { code: 'const a = 1', kind: 'code', language: 'ts' },
      { kind: 'text', text: 'after' }
    ])
  })

  it('keeps an unterminated fence as code instead of dropping it', () => {
    // This is the streaming case: the closing fence has not arrived yet, and
    // dropping the tail would make a partial reply look like an empty card.
    const segments = splitMarkdownSegments('intro\n```py\nprint(1)')

    expect(segments[1]).toEqual({ code: 'print(1)', kind: 'code', language: 'py' })
  })

  it('does not let a shorter inner fence close a longer one', () => {
    const segments = splitMarkdownSegments('````\n```\nstill inside\n````')

    expect(segments).toHaveLength(1)
    expect((segments[0] as { code: string }).code).toBe('```\nstill inside')
  })

  it('returns plain text untouched when there is no fence', () => {
    expect(splitMarkdownSegments('no code here')).toEqual([{ kind: 'text', text: 'no code here' }])
  })
})

describe('looksLikeDiff', () => {
  it('detects a diff by language tag or by content', () => {
    expect(looksLikeDiff('diff', '')).toBe(true)
    expect(looksLikeDiff('', '@@ -1,2 +1,2 @@\n-a\n+b')).toBe(true)
    expect(looksLikeDiff('', 'diff --git a/x b/x')).toBe(true)
  })

  it('does not mistake ordinary code for a diff', () => {
    expect(looksLikeDiff('ts', 'const a = 1')).toBe(false)
  })
})
