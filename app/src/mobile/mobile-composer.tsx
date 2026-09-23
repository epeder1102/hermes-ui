import { useStore } from '@nanostores/react'
import {
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react'

import { triggerHaptic } from '@/lib/haptics'
import {
  $composerDraft,
  clearSessionDraft,
  setComposerDraft,
  stashSessionDraft,
  takeSessionDraft
} from '@/store/composer'
import { $activeSessionId } from '@/store/session'

const MAX_TEXTAREA_HEIGHT_PX = 144
const DRAFT_SAVE_DELAY_MS = 400

interface MobileComposerProps {
  busy: boolean
  onCancel: () => Promise<unknown> | unknown
  onSubmit: (text: string) => Promise<boolean | void> | boolean | void
  ready: boolean
}

/**
 * Keep the shell pinned to Android's *visible* viewport. `100dvh` is not
 * reliable across WebView/keyboard versions: some resize layoutViewport and
 * some expose only visualViewport. A CSS variable gives the shell one source
 * of truth in both cases.
 */
export function useMobileViewportHeight() {
  useEffect(() => {
    const viewport = window.visualViewport
    const root = document.documentElement

    const sync = () => {
      const height = Math.round(viewport?.height ?? window.innerHeight)

      if (height > 0) {
        root.style.setProperty('--mobile-viewport-height', `${height}px`)
      }
    }

    sync()
    viewport?.addEventListener('resize', sync)
    viewport?.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)

    return () => {
      viewport?.removeEventListener('resize', sync)
      viewport?.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])
}

/**
 * A small draft engine for the standalone mobile shell. It intentionally uses
 * the desktop composer's existing session-keyed persistence primitives so a
 * draft survives backgrounding, process death, and a later desktop-shell
 * switch without introducing a second storage format.
 */
function useMobileDraft(scope: string | null) {
  const externalDraft = useStore($composerDraft)
  const initialScopeRef = useRef(scope)
  const initialDraftRef = useRef<string | null>(null)

  if (initialDraftRef.current === null) {
    initialDraftRef.current = takeSessionDraft(scope).text || externalDraft
  }

  const [draft, setDraftState] = useState(initialDraftRef.current)
  const draftRef = useRef(draft)
  const externalDraftRef = useRef(externalDraft)
  const scopeRef = useRef(scope)
  const saveTimerRef = useRef<number | undefined>(undefined)

  const cancelSave = useCallback(() => {
    if (saveTimerRef.current !== undefined) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = undefined
    }
  }, [])

  const flush = useCallback(() => {
    cancelSave()
    stashSessionDraft(scopeRef.current, draftRef.current, [])
  }, [cancelSave])

  const commit = useCallback((next: string) => {
    draftRef.current = next
    setDraftState(next)
    setComposerDraft(next)
  }, [])

  const scheduleSave = useCallback(() => {
    cancelSave()
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = undefined
      stashSessionDraft(scopeRef.current, draftRef.current, [])
    }, DRAFT_SAVE_DELAY_MS)
  }, [cancelSave])

  const update = useCallback(
    (next: string) => {
      commit(next)
      scheduleSave()
    },
    [commit, scheduleSave]
  )

  const clear = useCallback(() => {
    cancelSave()
    commit('')
    clearSessionDraft(scopeRef.current)
  }, [cancelSave, commit])

  // Swap session drafts without ever filing the old text under the new key.
  useEffect(() => {
    if (scopeRef.current === scope) {
      return
    }

    flush()
    scopeRef.current = scope
    commit(takeSessionDraft(scope).text)
  }, [commit, flush, scope])

  // Slash commands and other shared actions can restore text through the
  // module-level composer atom. Mirror those writes into this textarea.
  useEffect(() => {
    if (externalDraft === externalDraftRef.current) {
      return
    }

    externalDraftRef.current = externalDraft

    if (externalDraft !== draftRef.current) {
      update(externalDraft)
    }
  }, [externalDraft, update])

  // Publish a restored session draft after the first mount without treating
  // the atom's pre-mount value as a newer external edit.
  useEffect(() => {
    if ($composerDraft.get() !== draftRef.current) {
      setComposerDraft(draftRef.current)
    }
  }, [])

  useEffect(() => {
    const onPageHide = () => flush()

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flush()
      }
    }

    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      flush()
    }
  }, [flush])

  return { clear, draft, update }
}

export function MobileComposer({ busy, onCancel, onSubmit, ready }: MobileComposerProps) {
  const sessionId = useStore($activeSessionId)
  const { clear, draft, update } = useMobileDraft(sessionId)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const resizeInput = useCallback(() => {
    const input = inputRef.current

    if (!input) {
      return
    }

    input.style.height = '0px'
    const measured = input.scrollHeight
    const height = Math.min(MAX_TEXTAREA_HEIGHT_PX, Math.max(44, measured))
    input.style.height = `${height}px`
    input.style.overflowY = measured > MAX_TEXTAREA_HEIGHT_PX ? 'auto' : 'hidden'
  }, [])

  useLayoutEffect(resizeInput, [draft, resizeInput])

  const send = useCallback(async () => {
    const text = draft.trim()

    if (!text || !ready || submitting) {
      return
    }

    setError(null)
    setSubmitting(true)
    clear()
    triggerHaptic('submit')

    try {
      const accepted = await onSubmit(text)

      if (accepted === false) {
        update(text)
        setError('Message was not sent. Your draft has been restored.')
      }
    } catch (cause) {
      update(text)
      setError(cause instanceof Error ? cause.message : 'Message was not sent. Your draft has been restored.')
    } finally {
      setSubmitting(false)
    }
  }, [clear, draft, onSubmit, ready, submitting, update])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      // Phone keyboards get a real newline. Hardware keyboards retain an
      // explicit shortcut without making ordinary Enter surprising.
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        void send()
      }
    },
    [send]
  )

  return (
    <footer
      data-testid="mobile-composer"
      style={{
        padding: '8px 10px max(10px, env(safe-area-inset-bottom))',
        borderTop: '1px solid var(--dt-border, #26262b)',
        background: 'color-mix(in srgb, var(--background, #0b0b0c) 92%, transparent)',
        boxShadow: '0 -10px 30px rgba(0,0,0,.16)',
        backdropFilter: 'blur(18px)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            border: `1px solid ${error ? 'var(--dt-destructive, #ff8383)' : 'var(--dt-border, #34343d)'}`,
            borderRadius: 14,
            background: 'var(--dt-card, #151519)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.035)'
          }}
        >
          <textarea
            aria-label="Message Hermes"
            disabled={!ready}
            enterKeyHint="enter"
            onChange={event => update(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={ready ? 'Message Hermes…' : 'Connecting…'}
            ref={inputRef}
            rows={1}
            style={{
              display: 'block',
              width: '100%',
              minHeight: 44,
              maxHeight: MAX_TEXTAREA_HEIGHT_PX,
              resize: 'none',
              overflowY: 'hidden',
              background: 'transparent',
              color: 'inherit',
              border: 0,
              outline: 0,
              borderRadius: 14,
              padding: '11px 12px',
              fontSize: 16,
              lineHeight: 1.35,
              fontFamily: 'inherit'
            }}
            value={draft}
          />
        </div>

        {busy ? (
          <button aria-label="Stop response" onClick={() => void onCancel()} style={actionButton} type="button">
            Stop
          </button>
        ) : (
          <button
            aria-label="Send"
            disabled={!ready || submitting || !draft.trim()}
            onClick={() => void send()}
            style={{
              ...actionButton,
              background: draft.trim() && ready ? 'var(--dt-primary, #ffac02)' : 'var(--dt-secondary, #292930)',
              color: draft.trim() && ready ? 'var(--background, #170d02)' : 'var(--foreground, #e7e7ea)',
              opacity: !ready || submitting || !draft.trim() ? 0.52 : 1
            }}
            type="button"
          >
            {submitting ? '…' : 'Send'}
          </button>
        )}
      </div>

      {error ? (
        <div role="alert" style={{ color: 'var(--dt-destructive, #ff8383)', fontSize: 12, padding: '6px 4px 0' }}>
          {error}
        </div>
      ) : (
        draft.includes('\n') && (
          <div style={{ color: 'var(--dt-muted-foreground, #898992)', fontSize: 11, padding: '5px 4px 0' }}>
            Enter adds a line · Ctrl/⌘+Enter sends
          </div>
        )
      )}
    </footer>
  )
}

const actionButton: CSSProperties = {
  minWidth: 64,
  minHeight: 48,
  padding: '0 14px',
  border: '1px solid var(--dt-border, #3a3a44)',
  borderRadius: 14,
  background: 'var(--dt-secondary, #292930)',
  color: 'var(--foreground, #e7e7ea)',
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: '0.01em',
  touchAction: 'manipulation'
}
