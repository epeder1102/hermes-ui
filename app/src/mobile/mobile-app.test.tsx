// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { I18nProvider } from '@/i18n'
import { queryClient } from '@/lib/query-client'
import { setGatewayState, setMessages } from '@/store/session'
import { ThemeProvider } from '@/themes/context'

import { MobileApp } from './mobile-app'

/**
 * P4 kill-criterion proof.
 *
 * The plan's go/no-go for keeping this codebase was: can the message stream and
 * composer be mounted in a STANDALONE mobile route without rewriting the stores?
 *
 * This test answers it at runtime rather than by inspection. Mounting <MobileApp/>
 * runs `useChatEngine`, which drives the same seven hooks the desktop controller
 * uses (session-state cache, gateway request/boot, message stream, session
 * actions, composer actions, prompt actions). Nothing from the three-pane shell
 * — no panes, no layout store, no titlebar, no desktop controller — is mounted.
 *
 * If the chat state were entangled with the desktop layout, this render would
 * throw. That it renders, and that `$messages` written directly to the store
 * appear in the standalone shell, is the evidence the stores are shell-agnostic.
 */
function renderMobileShell() {
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ThemeProvider>
          <HashRouter>
            <MobileApp />
          </HashRouter>
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  setMessages([])
  setGatewayState('idle')
})

describe('mobile shell (P4 kill criterion)', () => {
  it('mounts the chat engine standalone, with no desktop shell in the tree', () => {
    expect(() => renderMobileShell()).not.toThrow()

    // The composer is present even before the gateway opens (disabled state).
    expect(screen.getByPlaceholderText(/connecting/i)).toBeTruthy()
  })

  it('renders messages written directly to the shared $messages store', () => {
    renderMobileShell()

    // Nanostore writes land outside React's batching, so flush them through
    // act() exactly as a real gateway delta would be flushed on the device.
    act(() => {
      setMessages([
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hello from the phone' }] },
        { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'streamed reply' }] }
      ])
    })

    expect(screen.getByText('hello from the phone')).toBeTruthy()
    expect(screen.getByText('streamed reply')).toBeTruthy()
  })

  it('enables the composer when the shared gateway state opens', () => {
    renderMobileShell()

    act(() => {
      setGatewayState('open')
    })

    const input = screen.getByPlaceholderText(/message hermes/i) as HTMLTextAreaElement

    expect(input.disabled).toBe(false)
  })
})
