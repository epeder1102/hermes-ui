// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { I18nProvider } from '@/i18n'
import { queryClient } from '@/lib/query-client'
import { $activeGatewayProfile, $newChatProfile, $profiles } from '@/store/profile'
import { setBusy, setGatewayState, setMessages, setSelectedStoredSessionId, setSessions } from '@/store/session'
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
  setSessions([])
  setSelectedStoredSessionId(null)
  setGatewayState('idle')
  setBusy(false)
})

describe('mobile shell (P4 kill criterion)', () => {
  it('mounts the chat engine standalone, with no desktop shell in the tree', () => {
    expect(() => renderMobileShell()).not.toThrow()

    // The composer is present before the gateway opens so a draft can be written while reconnecting.
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

  it('keeps a 500-message transcript bounded with a virtualized message window', () => {
    act(() => {
      setMessages(
        Array.from({ length: 500 }, (_, index) => ({
          id: `message-${index}`,
          role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
          parts: [{ type: 'text' as const, text: `virtual message ${index}` }]
        }))
      )
    })

    const { container } = renderMobileShell()
    const renderedRows = container.querySelectorAll('[data-message-index]')

    expect(renderedRows.length).toBeGreaterThan(0)
    expect(renderedRows.length).toBeLessThan(40)
    expect(screen.queryByText('virtual message 250')).toBeNull()
  })

  it('excludes hidden records from the visible transcript', () => {
    act(() => {
      setMessages([
        { id: 'hidden', role: 'assistant', hidden: true, parts: [{ type: 'text', text: 'internal hidden record' }] },
        { id: 'visible', role: 'assistant', parts: [{ type: 'text', text: 'visible response' }] }
      ])
    })

    renderMobileShell()

    expect(screen.queryByText('internal hidden record')).toBeNull()
    expect(screen.getByText('visible response')).toBeTruthy()
  })

  it('marks only tools in the pending message as running', () => {
    act(() => {
      setBusy(true)
      setMessages([
        {
          id: 'historical',
          role: 'assistant',
          parts: [
            {
              type: 'tool-call',
              toolCallId: 'historical-tool',
              toolName: 'terminal',
              args: { command: 'pwd' },
              argsText: '{}'
            } as never
          ]
        },
        {
          id: 'active',
          role: 'assistant',
          pending: true,
          parts: [
            {
              type: 'tool-call',
              toolCallId: 'active-tool',
              toolName: 'web_search',
              args: { query: 'Hermes' },
              argsText: '{}'
            } as never
          ]
        }
      ])
    })

    renderMobileShell()

    expect(screen.queryByRole('button', { name: /terminal.*running/i })).toBeNull()
    expect(screen.getByRole('button', { name: /web_search.*running/i })).toBeTruthy()
  })

  it('stops following while history is being read and offers an explicit jump to latest', () => {
    act(() => {
      setMessages(
        Array.from({ length: 20 }, (_, index) => ({
          id: `message-${index}`,
          role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
          parts: [{ type: 'text' as const, text: `scroll message ${index}` }]
        }))
      )
    })

    renderMobileShell()
    const transcript = screen.getByRole('log', { name: /conversation messages/i })

    Object.defineProperties(transcript, {
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 4_000 },
      scrollTop: { configurable: true, value: 400, writable: true }
    })
    fireEvent.scroll(transcript)

    const jump = screen.getByRole('button', { name: /jump to latest message/i })

    expect(jump).toBeTruthy()

    act(() => {
      setMessages(
        Array.from({ length: 21 }, (_, index) => ({
          id: `message-${index}`,
          role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
          parts: [{ type: 'text' as const, text: `scroll message ${index}` }]
        }))
      )
    })

    // Streaming must not drag a reader away from history after the bottom lock
    // has been released.
    expect(transcript.scrollTop).toBe(400)
    expect(screen.getByRole('button', { name: /jump to latest message/i })).toBeTruthy()

    fireEvent.click(jump)
    expect(screen.queryByRole('button', { name: /jump to latest message/i })).toBeNull()
  })

  it('opens mobile conversation navigation from the active title', () => {
    act(() => {
      setSessions([
        {
          id: 'saved-session',
          title: 'Navigation work',
          preview: 'Continue the mobile drawer',
          message_count: 4,
          started_at: 1_700_000_000,
          last_active: 1_700_000_200,
          ended_at: null,
          input_tokens: 0,
          is_active: false,
          model: 'test-model',
          output_tokens: 0,
          source: 'web',
          tool_call_count: 0,
        }
      ])
      setSelectedStoredSessionId('saved-session')
    })
    renderMobileShell()

    expect(screen.getByText('Navigation work')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /open conversations/i }))

    expect(screen.getByRole('dialog', { name: /conversations/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /open navigation work/i })).toBeTruthy()
  })
})

describe('mobile tool-call cards', () => {
  const toolPart = (over: Record<string, unknown> = {}) => ({
    type: 'tool-call',
    toolCallId: 'call-1',
    toolName: 'terminal',
    args: { command: 'ls -la /very/long/path/that/would/overflow/a/phone/screen' },
    argsText: '{}',
    ...over
  })

  function seedToolMessage(over: Record<string, unknown> = {}) {
    act(() => {
      setGatewayState('open')
      setMessages([
        {
          id: 'a1',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'running that now' },
            toolPart(over) as never
          ]
        }
      ])
    })
  }

  it('renders a tool call as a collapsed one-line card, not raw text', () => {
    renderMobileShell()
    seedToolMessage({ result: { stdout: 'total 0\nsecond line stays hidden\nthird line too' } })

    // The surrounding narrative text still renders as a normal bubble...
    expect(screen.getByText('running that now')).toBeTruthy()

    // ...and the tool call is a button (tappable row), not inline text.
    const card = screen.getByRole('button', { name: /terminal/i })

    expect(card).toBeTruthy()

    // Collapsed means ONE line: a first-line preview is shown, but the rest of
    // the output is not in the transcript. This is the invariant that keeps a
    // noisy tool run from burying the conversation on a phone.
    expect(screen.queryByText(/second line stays hidden/)).toBeNull()
    expect(screen.queryByText(/third line too/)).toBeNull()
  })

  it('opens a bottom sheet with the output when the card is tapped', () => {
    renderMobileShell()
    seedToolMessage({ result: { stdout: 'total 0\ndrwxr-xr-x 2 eric eric\n' } })

    fireEvent.click(screen.getByRole('button', { name: /terminal/i }))

    // The sheet, not the transcript, is what shows the output.
    expect(screen.getByText(/drwxr-xr-x/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /close/i })).toBeTruthy()
  })

  it('closes the sheet again, restoring the collapsed transcript', () => {
    renderMobileShell()
    // Multi-line on purpose: the collapsed card's subtitle legitimately echoes
    // the FIRST output line, so asserting on it would be ambiguous. The second
    // line exists only inside the sheet.
    seedToolMessage({ result: { stdout: 'summary line\nvisible only in the sheet' } })

    fireEvent.click(screen.getByRole('button', { name: /terminal/i }))
    expect(screen.getByText(/visible only in the sheet/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByText(/visible only in the sheet/)).toBeNull()
  })

  it('keeps a tool call in narrative order between text blocks', () => {
    renderMobileShell()

    act(() => {
      setGatewayState('open')
      setMessages([
        {
          id: 'a1',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'first I will look' },
            toolPart({ result: {} }) as never,
            { type: 'text', text: 'and here is what I found' }
          ]
        }
      ])
    })

    const rendered = screen.getByText('first I will look').parentElement?.textContent ?? ''

    expect(rendered.indexOf('first I will look')).toBeLessThan(rendered.indexOf('and here is what I found'))
  })
})

describe('mobile profile switcher', () => {
  const PROFILES = [
    { has_env: true, is_default: true, model: 'gpt-5.6-sol', name: 'default', path: '/root/.hermes', provider: 'openai-codex', skill_count: 3 },
    { has_env: true, is_default: false, model: 'gpt-5.6-sol', name: 'dev', path: '/root/.hermes/profiles/dev', provider: 'openai-codex', skill_count: 5 }
  ]

  afterEach(() => {
    act(() => {
      $profiles.set([])
      $newChatProfile.set(null)
      // selectProfile() also drives ensureGatewayProfile(), which sets the
      // active gateway profile. Resetting only $newChatProfile would leak the
      // previous test's choice into the next render.
      $activeGatewayProfile.set('default')
    })
  })

  it('shows the active profile in the header', () => {
    renderMobileShell()

    expect(screen.getByRole('button', { name: /profile: default/i })).toBeTruthy()
  })

  it('lists the available profiles when opened', () => {
    renderMobileShell()

    act(() => {
      $profiles.set(PROFILES)
    })

    fireEvent.click(screen.getByRole('button', { name: /profile: default/i }))

    expect(screen.getByText('dev')).toBeTruthy()
    expect(screen.getAllByText(/openai-codex/).length).toBeGreaterThan(0)
  })

  it('selecting a profile targets the next chat at it', () => {
    renderMobileShell()

    act(() => {
      $profiles.set(PROFILES)
    })

    fireEvent.click(screen.getByRole('button', { name: /profile: default/i }))
    act(() => {
      fireEvent.click(screen.getByText('dev'))
    })

    // $newChatProfile is what createBackendSessionForSend passes to
    // session.create as `profile`, which is the ONLY thing that moves a turn to
    // another profile's HERMES_HOME. Asserting on it pins the actual contract
    // rather than the button's styling.
    expect($newChatProfile.get()).toBe('dev')
    expect(screen.getByRole('button', { name: /profile: dev/i })).toBeTruthy()
  })

  it('closes without changing anything on cancel', () => {
    renderMobileShell()

    act(() => {
      $profiles.set(PROFILES)
    })

    fireEvent.click(screen.getByRole('button', { name: /profile: default/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect($newChatProfile.get()).toBeNull()
    expect(screen.queryByText(/applies to the next chat/i)).toBeNull()
  })
})
