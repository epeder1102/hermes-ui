// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearSessionDraft, setComposerDraft, stashSessionDraft } from '@/store/composer'
import { $activeSessionId } from '@/store/session'

import { MobileComposer, useMobileViewportHeight } from './mobile-composer'

const SESSION_ID = 'mobile-session-1'

function renderComposer(overrides: Partial<React.ComponentProps<typeof MobileComposer>> = {}) {
  const props: React.ComponentProps<typeof MobileComposer> = {
    busy: false,
    onCancel: vi.fn(async () => undefined),
    onSubmit: vi.fn(async () => true),
    ready: true,
    ...overrides
  }

  return { props, ...render(<MobileComposer {...props} />) }
}

afterEach(() => {
  cleanup()
  clearSessionDraft(SESSION_ID)
  clearSessionDraft(null)
  setComposerDraft('')
  $activeSessionId.set(null)
  document.documentElement.style.removeProperty('--mobile-viewport-height')
  vi.restoreAllMocks()
})

describe('mobile composer', () => {
  it('keeps plain Enter as a newline and submits only from the explicit shortcut', async () => {
    const { props } = renderComposer()
    const input = screen.getByRole('textbox')

    fireEvent.change(input, { target: { value: 'first line' } })

    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(true)
    expect(props.onSubmit).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { ctrlKey: true, key: 'Enter' })

    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledWith('first line'))
  })

  it('restores the draft when submit is rejected', async () => {
    renderComposer({ onSubmit: vi.fn(async () => false) })
    const input = screen.getByRole('textbox') as HTMLTextAreaElement

    fireEvent.change(input, { target: { value: 'do not lose this' } })
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }))

    await waitFor(() => expect(input.value).toBe('do not lose this'))
    expect(screen.getByRole('alert').textContent).toContain('not sent')
  })

  it('flushes and restores the active session draft across an unmount', () => {
    act(() => {
      $activeSessionId.set(SESSION_ID)
    })

    const first = renderComposer()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'survives backgrounding' } })
    fireEvent(window, new Event('pagehide'))
    first.unmount()

    renderComposer()

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('survives backgrounding')
  })

  it('loads the draft already stashed for the active session', () => {
    stashSessionDraft(SESSION_ID, 'restored session draft', [])
    act(() => {
      $activeSessionId.set(SESSION_ID)
    })

    renderComposer()

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('restored session draft')
  })

  it('caps textarea growth and scrolls longer drafts internally', () => {
    renderComposer()
    const input = screen.getByRole('textbox') as HTMLTextAreaElement

    Object.defineProperty(input, 'scrollHeight', { configurable: true, value: 220 })
    fireEvent.change(input, { target: { value: 'one\ntwo\nthree\nfour\nfive\nsix\nseven' } })

    expect(input.style.height).toBe('144px')
    expect(input.style.overflowY).toBe('auto')
  })
})

describe('mobile visual viewport', () => {
  function ViewportProbe() {
    useMobileViewportHeight()

    return null
  }

  it('tracks the visual viewport so the keyboard cannot hide the composer', () => {
    const viewport = new EventTarget() as VisualViewport
    Object.defineProperties(viewport, {
      height: { configurable: true, value: 512 },
      offsetTop: { configurable: true, value: 0 }
    })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })

    render(<ViewportProbe />)

    expect(document.documentElement.style.getPropertyValue('--mobile-viewport-height')).toBe('512px')
  })
})
