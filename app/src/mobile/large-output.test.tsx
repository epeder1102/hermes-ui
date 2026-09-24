// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CodeBlock } from './code-block'
import { DiffView } from './diff-view'
import { ToolSheet } from './tool-sheet'

const writeText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  writeText.mockReset()
  writeText.mockResolvedValue()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})

afterEach(() => {
  cleanup()
})

describe('mobile large-output budgets', () => {
  it('keeps a 10,000-line tool result bounded and virtualizes the complete output full screen', async () => {
    const stdout = Array.from({ length: 10_000 }, (_, index) => `tool-line-${String(index + 1).padStart(5, '0')}`).join('\n')

    render(
      <ToolSheet
        onClose={vi.fn()}
        pending={false}
        view={{ stderr: '', stdout, subtitle: 'stress output', title: 'Ran a command' } as never}
      />
    )

    const preview = document.querySelector('pre')

    expect(preview?.textContent).not.toContain('tool-line-00001')
    expect(preview?.textContent).toContain('tool-line-10000')
    expect(preview?.textContent.length).toBeLessThan(64 * 1024 + 1)

    const trigger = screen.getByRole('button', { name: /show all 10,?000 lines/i })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', { name: /stdout full screen/i })
    const virtualLines = dialog.querySelectorAll('[data-virtual-line]')

    expect(virtualLines.length).toBeGreaterThan(0)
    expect(virtualLines.length).toBeLessThan(80)
    expect(dialog.textContent).toContain('tool-line-00001')
    expect(dialog.textContent).not.toContain('tool-line-10000')
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: /close/i }))

    const copyButton = within(dialog).getByRole('button', { name: /^copy$/i })
    fireEvent.click(copyButton)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(stdout))
    copyButton.focus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: /close/i }))

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: /stdout full screen/i })).toBeNull()
    expect(document.activeElement).toBe(trigger)
    // Escape closes only the topmost reader; the underlying tool sheet remains.
    expect(screen.getByRole('button', { name: /^close$/i })).toBeTruthy()
  })

  it('caps an expanded 2,000-line diff hunk and virtualizes its full-screen reader', () => {
    const diff = [
      'diff --git a/src/large.ts b/src/large.ts',
      '--- a/src/large.ts',
      '+++ b/src/large.ts',
      '@@ -1,1000 +1,1000 @@ large change',
      ...Array.from({ length: 1_000 }, (_, index) => `-removed-${String(index + 1).padStart(4, '0')}`),
      ...Array.from({ length: 1_000 }, (_, index) => `+added-${String(index + 1).padStart(4, '0')}`)
    ].join('\n')

    const { container } = render(<DiffView diff={diff} />)

    fireEvent.click(screen.getByRole('button', { name: /large change/i }))

    expect(container.querySelectorAll('[data-diff-line]')).toHaveLength(160)
    expect(container.textContent).not.toContain('added-1000')

    fireEvent.click(screen.getByRole('button', { name: /show all 2,?000 hunk lines full screen/i }))

    const dialog = screen.getByRole('dialog', { name: /diff full screen/i })

    expect(dialog.querySelectorAll('[data-virtual-line]').length).toBeLessThan(80)
    expect(dialog.textContent).toContain('diff --git')
    expect(dialog.textContent).not.toContain('added-1000')

    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }))
    expect(container.querySelectorAll('[data-diff-line]')).toHaveLength(160)
  })

  it('bounds a many-hunk diff globally instead of mounting every hunk control', () => {
    const diff = [
      'diff --git a/src/many.ts b/src/many.ts',
      '--- a/src/many.ts',
      '+++ b/src/many.ts',
      ...Array.from({ length: 100 }, (_, index) => [`@@ -${index + 1},1 +${index + 1},1 @@ hunk ${index + 1}`, `-old-${index + 1}`, `+new-${index + 1}`]).flat()
    ].join('\n')

    render(<DiffView diff={diff} />)

    expect(screen.getAllByRole('button', { name: /hunk \d+/i })).toHaveLength(40)
    expect(screen.getByRole('button', { name: /open full diff.*60 more hunks/i })).toBeTruthy()
  })

  it('treats context-heavy diffs as large by physical lines', () => {
    const diff = [
      'diff --git a/src/context.ts b/src/context.ts',
      '--- a/src/context.ts',
      '+++ b/src/context.ts',
      '@@ -1,500 +1,500 @@ context only',
      ...Array.from({ length: 500 }, (_, index) => ` context-${index + 1}`)
    ].join('\n')

    render(<DiffView diff={diff} />)

    expect(screen.getByText(/large diff \(504 physical lines, 0 changed\)/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /context only/i }).getAttribute('aria-expanded')).toBe('false')
  })

  it('caps pathological single-line diff rows by characters', () => {
    const giantLine = `+${'x'.repeat(128 * 1024)}`

    const diff = [
      'diff --git a/src/minified.js b/src/minified.js',
      '--- a/src/minified.js',
      '+++ b/src/minified.js',
      '@@ -0,0 +1 @@ minified bundle',
      giantLine
    ].join('\n')

    const { container } = render(<DiffView diff={diff} />)
    const renderedLine = container.querySelector('[data-diff-line]')

    expect(renderedLine?.textContent?.length).toBeLessThan(17 * 1024)
    expect(renderedLine?.textContent).toContain('Copy includes full content')
  })

  it('opens long fenced code in a bounded virtual reader instead of expanding the transcript row', () => {
    const code = Array.from({ length: 500 }, (_, index) => `const value${index + 1} = ${index + 1}`).join('\n')
    const { container } = render(<CodeBlock code={code} language="ts" />)

    expect(container.querySelector('pre')?.textContent).not.toContain('value500')
    fireEvent.click(screen.getByRole('button', { name: /show all 500 lines/i }))

    const dialog = screen.getByRole('dialog', { name: /ts code full screen/i })

    expect(dialog.querySelectorAll('[data-virtual-line]').length).toBeLessThan(80)
    expect(dialog.textContent).not.toContain('value500')
    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }))
    expect(container.querySelector('pre')?.textContent).not.toContain('value500')
  })
})
