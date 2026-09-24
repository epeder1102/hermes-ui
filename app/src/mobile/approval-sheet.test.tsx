// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { $gateway } from '@/store/gateway'
import { clearAllPrompts, setApprovalRequest } from '@/store/prompts'
import { setActiveSessionId } from '@/store/session'

import { MobileApprovalSheet } from './approval-sheet'
import { FullscreenText } from './fullscreen-text'

function showApproval(over: Partial<Parameters<typeof setApprovalRequest>[0]> = {}) {
  act(() => {
    setActiveSessionId('session-1')
    setApprovalRequest({
      command: 'sudo rm -rf /tmp/example --with-a-very-long-argument-that-must-not-be-truncated',
      description: 'Remove generated files before rebuilding.',
      sessionId: 'session-1',
      ...over
    })
  })
}

function installGateway(result: Promise<unknown> = Promise.resolve({ resolved: true })) {
  const request = vi.fn(() => result)
  act(() => {
    $gateway.set({ request } as never)
  })

  return request
}

afterEach(() => {
  cleanup()
  act(() => {
    clearAllPrompts()
    setActiveSessionId(null)
    $gateway.set(null)
  })
})

describe('mobile approval sheet', () => {
  it('shows the complete command for the active session in a blocking dialog', () => {
    render(<MobileApprovalSheet />)
    showApproval()

    expect(screen.getByRole('dialog', { name: /approval required/i })).toBeTruthy()
    expect(screen.getByTestId('mobile-approval-command').textContent).toContain('--with-a-very-long-argument')
    expect(screen.getByText('Remove generated files before rebuilding.')).toBeTruthy()
  })

  it('does not let backdrop clicks or Escape strand a pending approval', () => {
    render(<MobileApprovalSheet />)
    showApproval()

    fireEvent.click(screen.getByTestId('mobile-approval-backdrop'))
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.getByRole('dialog', { name: /approval required/i })).toBeTruthy()
  })

  it('responds for the correct session and closes only after success', async () => {
    const request = installGateway()
    render(<MobileApprovalSheet />)
    showApproval()

    fireEvent.click(screen.getByRole('button', { name: /allow once/i }))

    expect(request).toHaveBeenCalledWith('approval.respond', {
      choice: 'once',
      session_id: 'session-1'
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('keeps the decision visible with an actionable error when the RPC fails', async () => {
    installGateway(Promise.reject(new Error('socket closed')))
    render(<MobileApprovalSheet />)
    showApproval()

    fireEvent.click(screen.getByRole('button', { name: /deny/i }))

    expect((await screen.findByRole('alert')).textContent).toContain('socket closed')
    expect(screen.getByRole('dialog', { name: /approval required/i })).toBeTruthy()
  })

  it('hides permanent approval when the backend disallows it', () => {
    render(<MobileApprovalSheet />)
    showApproval({ allowPermanent: false })

    expect(screen.queryByRole('button', { name: /always allow/i })).toBeNull()
  })

  it('never surfaces an approval belonging to a background session', () => {
    render(<MobileApprovalSheet />)
    act(() => {
      setActiveSessionId('session-1')
      setApprovalRequest({ command: 'dangerous command', description: 'Background task', sessionId: 'session-2' })
    })

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('portals blocking approval above an informational full-screen reader and owns Escape', () => {
    const closeReader = vi.fn()
    render(
      <>
        <FullscreenText onClose={closeReader} text="large output" title="stdout" />
        <MobileApprovalSheet />
      </>
    )

    showApproval()

    const approval = screen.getByRole('dialog', { name: /approval required/i })
    const reader = document.querySelector<HTMLElement>('[role="dialog"][aria-hidden="true"]')

    expect(reader).not.toBeNull()
    expect(Number(approval.style.zIndex)).toBeGreaterThan(Number(reader?.style.zIndex))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /allow once/i }))

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: /approval required/i })).toBeTruthy()
    expect(closeReader).not.toHaveBeenCalled()
  })

  it('keeps the app isolated when an underlying reader unmounts before the approval', () => {
    const closeReader = vi.fn()

    const rendered = render(
      <>
        <FullscreenText onClose={closeReader} text="large output" title="stdout" />
        <MobileApprovalSheet />
      </>
    )

    showApproval()

    rendered.rerender(<MobileApprovalSheet />)

    expect(rendered.container.inert).toBe(true)
    expect(rendered.container.getAttribute('aria-hidden')).toBe('true')

    act(() => clearAllPrompts())

    expect(rendered.container.inert).not.toBe(true)
    expect(rendered.container.hasAttribute('aria-hidden')).toBe(false)
  })

  it('moves focus into permanent confirmation and restores the prior trigger on close', () => {
    const rendered = render(
      <>
        <button type="button">Open approval</button>
        <MobileApprovalSheet />
      </>
    )

    const trigger = screen.getByRole('button', { name: /open approval/i })
    trigger.focus()
    showApproval()

    fireEvent.click(screen.getByRole('button', { name: /always allow/i }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^back$/i }))

    trigger.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^back$/i }))

    act(() => clearAllPrompts())
    expect(document.activeElement).toBe(trigger)
    expect(rendered.container.inert).not.toBe(true)
  })
})
