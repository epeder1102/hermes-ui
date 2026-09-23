// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CodeBlock } from './code-block'
import { DiffView } from './diff-view'
import { ToolSheet } from './tool-sheet'

afterEach(() => {
  cleanup()
})

describe('mobile large-output budgets', () => {
  it('keeps a 10,000-line tool result bounded and opens the complete output full screen', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /show all 10,?000 lines/i }))

    const dialog = screen.getByRole('dialog', { name: /stdout full screen/i })
    const fullText = dialog.querySelector('[data-fullscreen-text]')

    expect(fullText?.textContent).toContain('tool-line-00001')
    expect(fullText?.textContent).toContain('tool-line-10000')
    // The payload is one text node, not 10,000 line elements.
    expect(dialog.querySelectorAll('*').length).toBeLessThan(20)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: /stdout full screen/i })).toBeNull()
    // Escape closes only the topmost reader; the underlying tool sheet remains.
    expect(screen.getByRole('button', { name: /^close$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /show all 10,?000 lines/i })).toBeTruthy()
  })

  it('caps an expanded 2,000-line diff hunk and keeps its state behind the full-screen reader', () => {
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
    const fullText = dialog.querySelector('[data-fullscreen-text]')

    expect(fullText?.textContent).toContain('removed-1000')
    expect(fullText?.textContent).toContain('added-1000')
    expect(dialog.querySelectorAll('*').length).toBeLessThan(20)

    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }))
    expect(container.querySelectorAll('[data-diff-line]')).toHaveLength(160)
  })

  it('opens long fenced code full screen instead of expanding the transcript row', () => {
    const code = Array.from({ length: 500 }, (_, index) => `const value${index + 1} = ${index + 1}`).join('\n')
    const { container } = render(<CodeBlock code={code} language="ts" />)

    expect(container.querySelector('pre')?.textContent).not.toContain('value500')
    fireEvent.click(screen.getByRole('button', { name: /show all 500 lines/i }))

    const dialog = screen.getByRole('dialog', { name: /ts code full screen/i })

    expect(dialog.querySelector('[data-fullscreen-text]')?.textContent).toContain('value500')
    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }))
    expect(container.querySelector('pre')?.textContent).not.toContain('value500')
  })
})
