// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearSessionDraft, setComposerDraft, stashSessionDraft, takeSessionDraft } from '@/store/composer'
import { $activeSessionId, $selectedStoredSessionId } from '@/store/session'

import { MobileComposer, useMobileViewportHeight } from './mobile-composer'

const SESSION_ID = 'mobile-session-1'
const STORED_SESSION_ID = 'stored-session-1'

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
  clearSessionDraft(STORED_SESSION_ID)
  clearSessionDraft(null)
  setComposerDraft('')
  $activeSessionId.set(null)
  $selectedStoredSessionId.set(null)
  document.documentElement.style.removeProperty('--mobile-viewport-height')
  document.documentElement.style.removeProperty('--mobile-viewport-offset-top')
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

  it('does not submit a composing IME value from the hardware-keyboard shortcut', () => {
    const { props } = renderComposer()
    const input = screen.getByRole('textbox')

    fireEvent.change(input, { target: { value: '変換中' } })
    fireEvent.keyDown(input, { ctrlKey: true, isComposing: true, key: 'Enter' })

    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it('allows drafting while reconnecting but keeps send disabled', () => {
    renderComposer({ ready: false })
    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    const send = screen.getByRole('button', { name: /^send$/i }) as HTMLButtonElement

    expect(input.disabled).toBe(false)
    fireEvent.change(input, { target: { value: 'write this offline' } })

    expect(input.value).toBe('write this offline')
    expect(send.disabled).toBe(true)
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

  it('prefers the stored session identity over a transient runtime id', () => {
    stashSessionDraft(SESSION_ID, 'runtime draft', [])
    stashSessionDraft(STORED_SESSION_ID, 'stored draft', [])
    act(() => {
      $activeSessionId.set(SESSION_ID)
      $selectedStoredSessionId.set(STORED_SESSION_ID)
    })

    renderComposer()

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('stored draft')
  })

  it('restores a rejected send to its original session without replacing the newly selected draft', async () => {
    let resolveSubmit: ((accepted: boolean) => void) | undefined

    const onSubmit = vi.fn(
      () =>
        new Promise<boolean>(resolve => {
          resolveSubmit = resolve
        })
    )

    act(() => {
      $selectedStoredSessionId.set(SESSION_ID)
    })
    renderComposer({ onSubmit })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'original session text' } })
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }))

    stashSessionDraft(STORED_SESSION_ID, 'other session draft', [])
    act(() => {
      $selectedStoredSessionId.set(STORED_SESSION_ID)
    })
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('other session draft'))

    act(() => resolveSubmit?.(false))

    await waitFor(() => expect(takeSessionDraft(SESSION_ID).text).toBe('original session text'))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('other session draft')
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

  it('tracks viewport height and offset, coalesces updates, and cleans up', () => {
    let frameCallback: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameCallback = callback

      return 7
    })
    const viewport = new EventTarget() as VisualViewport
    Object.defineProperties(viewport, {
      height: { configurable: true, value: 512 },
      offsetTop: { configurable: true, value: 0 }
    })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })

    const rendered = render(<ViewportProbe />)

    expect(document.documentElement.style.getPropertyValue('--mobile-viewport-height')).toBe('512px')
    expect(document.documentElement.style.getPropertyValue('--mobile-viewport-offset-top')).toBe('0px')

    Object.defineProperties(viewport, {
      height: { configurable: true, value: 420 },
      offsetTop: { configurable: true, value: 24 }
    })
    viewport.dispatchEvent(new Event('resize'))
    viewport.dispatchEvent(new Event('scroll'))
    act(() => frameCallback?.(0))

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(document.documentElement.style.getPropertyValue('--mobile-viewport-height')).toBe('420px')
    expect(document.documentElement.style.getPropertyValue('--mobile-viewport-offset-top')).toBe('24px')

    rendered.unmount()
    expect(document.documentElement.style.getPropertyValue('--mobile-viewport-height')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--mobile-viewport-offset-top')).toBe('')
  })
})
