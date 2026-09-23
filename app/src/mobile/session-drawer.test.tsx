// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  setAttentionSessionIds,
  setSelectedStoredSessionId,
  setSessions,
  setSessionsLoading,
  setWorkingSessionIds
} from '@/store/session'
import type { SessionInfo } from '@/types/hermes'

import { MobileSessionDrawer } from './session-drawer'

const session = (id: string, title: string, over: Partial<SessionInfo> = {}): SessionInfo => ({
  ended_at: null,
  id,
  input_tokens: 0,
  is_active: false,
  last_active: 1_795_000_000,
  message_count: 3,
  model: 'gpt-5.6-sol',
  output_tokens: 0,
  preview: `${title} preview`,
  source: 'web',
  started_at: 1_795_000_000,
  title,
  tool_call_count: 0,
  ...over
})

function renderDrawer(over: Partial<React.ComponentProps<typeof MobileSessionDrawer>> = {}) {
  const props: React.ComponentProps<typeof MobileSessionDrawer> = {
    onClose: vi.fn(),
    onNewSession: vi.fn(),
    onRefresh: vi.fn().mockResolvedValue(undefined),
    onResumeSession: vi.fn().mockResolvedValue(undefined),
    onSwitchDesktop: vi.fn(),
    open: true,
    ...over
  }

  return { ...render(<MobileSessionDrawer {...props} />), props }
}

afterEach(() => {
  cleanup()
  act(() => {
    setSessions([])
    setSessionsLoading(false)
    setSelectedStoredSessionId(null)
    setWorkingSessionIds([])
    setAttentionSessionIds([])
  })
})

describe('MobileSessionDrawer', () => {
  it('renders recent sessions with selected, working, and attention states', async () => {
    act(() => {
      setSessions([
        session('active', 'Active conversation', { profile: 'dev' }),
        session('working', 'Background task'),
        session('attention', 'Needs a decision')
      ])
      setSelectedStoredSessionId('active')
      setWorkingSessionIds(['working'])
      setAttentionSessionIds(['attention'])
    })

    renderDrawer()

    expect(screen.getByRole('dialog', { name: /conversations/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /active conversation/i }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('Working')).toBeTruthy()
    expect(screen.getByText('Needs input')).toBeTruthy()
    expect(screen.getByText('dev')).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('searchbox', { name: /search conversations/i })).toBe(document.activeElement))
  })

  it('filters the loaded conversations without changing the store', () => {
    act(() => {
      setSessions([session('one', 'Release planning'), session('two', 'Grocery list')])
    })
    renderDrawer()

    fireEvent.change(screen.getByRole('searchbox', { name: /search conversations/i }), {
      target: { value: 'release' }
    })

    expect(screen.getByText('Release planning')).toBeTruthy()
    expect(screen.queryByText('Grocery list')).toBeNull()
    expect(screen.getByText(/1 of 2 conversations/i)).toBeTruthy()
  })

  it('resumes a selected conversation and closes only after dispatch succeeds', async () => {
    act(() => setSessions([session('target', 'Target conversation')]))
    let resolveResume: (() => void) | undefined

    const onResumeSession = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveResume = resolve
        })
    )

    const { props } = renderDrawer({ onResumeSession })

    fireEvent.click(screen.getByRole('button', { name: /target conversation/i }))
    expect(onResumeSession).toHaveBeenCalledWith('target')
    expect(props.onClose).not.toHaveBeenCalled()

    act(() => resolveResume?.())
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1))
  })

  it('shows loading, empty, and refresh-error states', async () => {
    act(() => setSessionsLoading(true))
    const { rerender, props } = renderDrawer()
    expect(screen.getByText(/loading conversations/i)).toBeTruthy()

    act(() => setSessionsLoading(false))
    rerender(<MobileSessionDrawer {...props} />)
    expect(screen.getByText(/no conversations yet/i)).toBeTruthy()

    props.onRefresh = vi.fn().mockRejectedValue(new Error('offline'))
    rerender(<MobileSessionDrawer {...props} open={false} />)
    rerender(<MobileSessionDrawer {...props} open />)
    await waitFor(() => expect(screen.getByText(/could not refresh conversations/i)).toBeTruthy())
  })

  it('creates a fresh chat and supports backdrop and Escape dismissal', () => {
    const first = renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: /new conversation/i }))
    expect(first.props.onNewSession).toHaveBeenCalledTimes(1)
    expect(first.props.onClose).toHaveBeenCalledTimes(1)
    first.unmount()

    const second = renderDrawer()
    fireEvent.mouseDown(screen.getByTestId('mobile-session-backdrop'))
    expect(second.props.onClose).toHaveBeenCalledTimes(1)
    second.unmount()

    const third = renderDrawer()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(third.props.onClose).toHaveBeenCalledTimes(1)
  })
})
