import { useStore } from '@nanostores/react'
import { type CSSProperties, useEffect, useMemo, useState } from 'react'

import { triggerHaptic } from '@/lib/haptics'
import {
  $attentionSessionIds,
  $selectedStoredSessionId,
  $sessions,
  $sessionsLoading,
  $workingSessionIds
} from '@/store/session'
import type { SessionInfo } from '@/types/hermes'

interface MobileSessionDrawerProps {
  open: boolean
  onClose: () => void
  onNewSession: () => void
  onRefresh: () => Promise<unknown> | unknown
  onResumeSession: (sessionId: string) => Promise<unknown> | unknown
  onSwitchDesktop: () => void
}

function sessionTitle(session: SessionInfo): string {
  return session.title?.trim() || session.preview?.trim().split('\n')[0] || 'Untitled conversation'
}

function sessionSubtitle(session: SessionInfo): string {
  const title = session.title?.trim()
  const preview = session.preview?.trim().replace(/\s+/g, ' ')

  if (preview && preview !== title) {
    return preview
  }

  if (session.cwd) {
    return session.cwd.split('/').filter(Boolean).at(-1) ?? session.cwd
  }

  return session.model || 'Conversation'
}

function timestampMs(timestamp: number): number {
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp
}

export function formatMobileSessionTime(timestamp: number, now = Date.now()): string {
  const date = new Date(timestampMs(timestamp))
  const today = new Date(now)

  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
  }

  if (date.getFullYear() === today.getFullYear()) {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date)
  }

  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: '2-digit' }).format(date)
}

export function MobileSessionDrawer({
  open,
  onClose,
  onNewSession,
  onRefresh,
  onResumeSession,
  onSwitchDesktop
}: MobileSessionDrawerProps) {
  const sessions = useStore($sessions)
  const loading = useStore($sessionsLoading)
  const selectedId = useStore($selectedStoredSessionId)
  const workingIds = useStore($workingSessionIds)
  const attentionIds = useStore($attentionSessionIds)
  const [query, setQuery] = useState('')
  const [refreshError, setRefreshError] = useState(false)
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [selectionError, setSelectionError] = useState(false)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setSelectingId(null)
      setSelectionError(false)

      return
    }

    setRefreshError(false)
    let active = true

    Promise.resolve(onRefresh()).catch(() => {
      if (active) {
        setRefreshError(true)
      }
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      active = false
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, onRefresh, open])

  const filteredSessions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()

    if (!needle) {
      return sessions
    }

    return sessions.filter(session =>
      [sessionTitle(session), session.preview, session.cwd, session.model, session.profile]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase().includes(needle))
    )
  }, [query, sessions])

  if (!open) {
    return null
  }

  const selectSession = async (sessionId: string) => {
    if (selectingId) {
      return
    }

    setSelectingId(sessionId)
    setSelectionError(false)
    triggerHaptic('selection')

    try {
      await onResumeSession(sessionId)
      onClose()
    } catch {
      setSelectingId(null)
      setSelectionError(true)
      triggerHaptic('error')
    }
  }

  const createSession = () => {
    triggerHaptic('selection')
    onNewSession()
    onClose()
  }

  return (
    <div
      data-testid="mobile-session-backdrop"
      onMouseDown={event => {
        if (event.currentTarget === event.target) {
          onClose()
        }
      }}
      style={styles.backdrop}
    >
      <aside aria-labelledby="mobile-session-drawer-title" aria-modal="true" role="dialog" style={styles.drawer}>
        <header style={styles.header}>
          <div>
            <p style={styles.eyebrow}>Hermes</p>
            <h2 id="mobile-session-drawer-title" style={styles.title}>
              Conversations
            </h2>
          </div>
          <button aria-label="Close conversations" onClick={onClose} style={styles.iconButton} type="button">
            <CloseIcon />
          </button>
        </header>

        <button onClick={createSession} style={styles.newButton} type="button">
          <PlusIcon />
          <span>New conversation</span>
        </button>

        <label style={styles.searchShell}>
          <span style={styles.visuallyHidden}>Search conversations</span>
          <SearchIcon />
          <input
            aria-label="Search conversations"
            onChange={event => setQuery(event.currentTarget.value)}
            placeholder="Search conversations"
            style={styles.searchInput}
            type="search"
            value={query}
          />
        </label>

        {(refreshError || selectionError) && (
          <div role="alert" style={styles.errorBanner}>
            {selectionError ? 'Could not open that conversation.' : 'Could not refresh conversations.'}
          </div>
        )}

        <div style={styles.list}>
          {loading && sessions.length === 0 ? (
            <div style={styles.state}>
              <span aria-hidden="true" style={styles.spinner} />
              <strong>Loading conversations…</strong>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div style={styles.state}>
              <span aria-hidden="true" style={styles.emptyIcon}>
                {query ? '⌕' : '✦'}
              </span>
              <strong>{query ? 'No matching conversations' : 'No conversations yet'}</strong>
              <span style={styles.stateCopy}>
                {query ? 'Try a different search.' : 'Start a new chat and it will appear here.'}
              </span>
            </div>
          ) : (
            filteredSessions.map(session => {
              const title = sessionTitle(session)
              const selected = session.id === selectedId
              const working = workingIds.includes(session.id)
              const needsAttention = attentionIds.includes(session.id)
              const selecting = selectingId === session.id

              return (
                <button
                  aria-current={selected ? 'page' : undefined}
                  aria-label={`Open ${title}`}
                  disabled={Boolean(selectingId)}
                  key={session.id}
                  onClick={() => void selectSession(session.id)}
                  style={{
                    ...styles.row,
                    ...(selected ? styles.rowSelected : null),
                    opacity: selectingId && !selecting ? 0.55 : 1
                  }}
                  type="button"
                >
                  <span aria-hidden="true" style={{ ...styles.avatar, ...(selected ? styles.avatarSelected : null) }}>
                    {title.charAt(0).toLocaleUpperCase() || 'H'}
                  </span>
                  <span style={styles.rowBody}>
                    <span style={styles.rowTopline}>
                      <strong style={styles.rowTitle}>{title}</strong>
                      <span style={styles.time}>{formatMobileSessionTime(session.last_active || session.started_at)}</span>
                    </span>
                    <span style={styles.rowBottomline}>
                      <span style={styles.rowSubtitle}>{sessionSubtitle(session)}</span>
                      {needsAttention ? (
                        <span style={styles.attentionBadge}>Needs input</span>
                      ) : working ? (
                        <span style={styles.workingBadge}>
                          <span aria-hidden="true" style={styles.workingDot} /> Working
                        </span>
                      ) : session.profile && !session.is_default_profile ? (
                        <span style={styles.profileBadge}>{session.profile}</span>
                      ) : null}
                    </span>
                  </span>
                  {selecting ? <span aria-label="Opening" style={styles.spinnerSmall} /> : selected ? <CheckIcon /> : null}
                </button>
              )
            })
          )}
        </div>

        <footer style={styles.footer}>
          <div style={styles.footerTopline}>
            <span>
              {query ? `${filteredSessions.length} of ${sessions.length}` : sessions.length}{' '}
              {sessions.length === 1 ? 'conversation' : 'conversations'}
            </span>
            <button
              disabled={loading}
              onClick={() => {
                setRefreshError(false)
                Promise.resolve(onRefresh()).catch(() => setRefreshError(true))
              }}
              style={styles.refreshButton}
              type="button"
            >
              Refresh
            </button>
          </div>
          <button onClick={onSwitchDesktop} style={styles.desktopButton} type="button">
            Open desktop layout
          </button>
        </footer>
      </aside>
    </div>
  )
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m16.5 16.5 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="21" viewBox="0 0 24 24" width="21">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="19" viewBox="0 0 24 24" width="19">
      <path d="m5 12 4 4L19 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

const styles: Record<string, CSSProperties> = {
  attentionBadge: {
    background: 'color-mix(in srgb, #f59e0b 17%, transparent)',
    border: '1px solid color-mix(in srgb, #f59e0b 36%, transparent)',
    borderRadius: 999,
    color: '#fbbf24',
    flexShrink: 0,
    fontSize: 10,
    fontWeight: 750,
    padding: '2px 7px'
  },
  avatar: {
    alignItems: 'center',
    background: 'color-mix(in srgb, var(--foreground) 8%, transparent)',
    border: '1px solid color-mix(in srgb, var(--foreground) 9%, transparent)',
    borderRadius: 13,
    color: 'color-mix(in srgb, var(--foreground) 72%, transparent)',
    display: 'flex',
    flex: '0 0 40px',
    fontSize: 14,
    fontWeight: 800,
    height: 40,
    justifyContent: 'center'
  },
  avatarSelected: {
    background: 'color-mix(in srgb, var(--dt-primary, #0053fd) 22%, transparent)',
    borderColor: 'color-mix(in srgb, var(--dt-primary, #0053fd) 38%, transparent)',
    color: 'var(--dt-primary, #0053fd)'
  },
  backdrop: {
    background: 'rgba(0, 0, 0, 0.58)',
    inset: 0,
    position: 'absolute',
    zIndex: 80
  },
  drawer: {
    backgroundColor: 'var(--ui-chat-surface-background, #f8faff)',
    backgroundImage:
      'linear-gradient(180deg, color-mix(in srgb, var(--ui-chat-surface-background, #f8faff) 97%, var(--dt-primary, #0053fd) 3%), var(--ui-chat-surface-background, #f8faff))',
    borderRight: '1px solid color-mix(in srgb, var(--foreground) 11%, transparent)',
    boxShadow: '24px 0 60px rgba(0, 0, 0, 0.34)',
    color: 'var(--foreground)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    maxWidth: 390,
    overflow: 'hidden',
    padding: 'calc(12px + env(safe-area-inset-top)) 12px calc(8px + env(safe-area-inset-bottom))',
    width: 'min(88vw, 390px)'
  },
  desktopButton: {
    background: 'transparent',
    border: '1px solid color-mix(in srgb, var(--foreground) 10%, transparent)',
    borderRadius: 10,
    color: 'color-mix(in srgb, var(--foreground) 62%, transparent)',
    fontSize: 11,
    fontWeight: 700,
    minHeight: 38,
    width: '100%'
  },
  emptyIcon: {
    alignItems: 'center',
    background: 'color-mix(in srgb, var(--dt-primary, #0053fd) 14%, transparent)',
    borderRadius: 16,
    color: 'var(--dt-primary, #0053fd)',
    display: 'flex',
    fontSize: 24,
    height: 48,
    justifyContent: 'center',
    marginBottom: 4,
    width: 48
  },
  errorBanner: {
    background: 'color-mix(in srgb, var(--destructive, #ef4444) 12%, transparent)',
    border: '1px solid color-mix(in srgb, var(--destructive, #ef4444) 28%, transparent)',
    borderRadius: 11,
    color: 'var(--destructive, #ef4444)',
    fontSize: 12,
    marginTop: 10,
    padding: '9px 11px'
  },
  eyebrow: {
    color: 'var(--dt-primary, #0053fd)',
    fontSize: 10,
    fontWeight: 850,
    letterSpacing: '0.16em',
    margin: '0 0 2px',
    textTransform: 'uppercase'
  },
  footer: {
    borderTop: '1px solid color-mix(in srgb, var(--foreground) 9%, transparent)',
    color: 'color-mix(in srgb, var(--foreground) 46%, transparent)',
    display: 'flex',
    flexDirection: 'column',
    fontSize: 11,
    gap: 4,
    padding: '5px 4px 0'
  },
  footerTopline: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'space-between',
    minHeight: 36
  },
  header: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'space-between',
    minHeight: 52,
    padding: '0 2px 8px'
  },
  iconButton: {
    alignItems: 'center',
    background: 'color-mix(in srgb, var(--foreground) 7%, transparent)',
    border: '1px solid color-mix(in srgb, var(--foreground) 10%, transparent)',
    borderRadius: 12,
    color: 'var(--foreground)',
    display: 'flex',
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  list: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    gap: 4,
    marginTop: 10,
    minHeight: 0,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    padding: '0 1px 10px'
  },
  newButton: {
    alignItems: 'center',
    background: 'var(--dt-primary, #0053fd)',
    border: 0,
    borderRadius: 13,
    boxShadow: '0 9px 24px color-mix(in srgb, var(--dt-primary, #0053fd) 22%, transparent)',
    color: 'var(--dt-primary-foreground, #fcfcfc)',
    display: 'flex',
    fontSize: 13,
    fontWeight: 760,
    gap: 8,
    justifyContent: 'center',
    minHeight: 46,
    padding: '0 14px',
    width: '100%'
  },
  profileBadge: {
    background: 'color-mix(in srgb, var(--foreground) 7%, transparent)',
    borderRadius: 999,
    color: 'color-mix(in srgb, var(--foreground) 55%, transparent)',
    flexShrink: 0,
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 7px'
  },
  refreshButton: {
    background: 'transparent',
    border: 0,
    color: 'var(--dt-primary, #0053fd)',
    fontSize: 12,
    fontWeight: 750,
    minHeight: 36,
    padding: '0 6px'
  },
  row: {
    alignItems: 'center',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 14,
    color: 'var(--foreground)',
    display: 'flex',
    flexShrink: 0,
    gap: 10,
    minHeight: 68,
    padding: '9px 9px',
    textAlign: 'left',
    width: '100%'
  },
  rowBody: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    gap: 5,
    minWidth: 0
  },
  rowBottomline: {
    alignItems: 'center',
    display: 'flex',
    gap: 7,
    minWidth: 0
  },
  rowSelected: {
    background: 'color-mix(in srgb, var(--dt-primary, #0053fd) 10%, transparent)',
    borderColor: 'color-mix(in srgb, var(--dt-primary, #0053fd) 22%, transparent)'
  },
  rowSubtitle: {
    color: 'color-mix(in srgb, var(--foreground) 48%, transparent)',
    flex: 1,
    fontSize: 11,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  rowTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: 720,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  rowTopline: {
    alignItems: 'baseline',
    display: 'flex',
    gap: 8,
    minWidth: 0
  },
  searchInput: {
    background: 'transparent',
    border: 0,
    color: 'var(--foreground)',
    flex: 1,
    fontSize: 14,
    height: 42,
    minWidth: 0,
    outline: 'none'
  },
  searchShell: {
    alignItems: 'center',
    background: 'color-mix(in srgb, var(--foreground) 6%, transparent)',
    border: '1px solid color-mix(in srgb, var(--foreground) 10%, transparent)',
    borderRadius: 12,
    color: 'color-mix(in srgb, var(--foreground) 45%, transparent)',
    display: 'flex',
    gap: 8,
    marginTop: 10,
    minHeight: 44,
    padding: '0 12px'
  },
  spinner: {
    border: '2px solid color-mix(in srgb, var(--dt-primary, #0053fd) 20%, transparent)',
    borderRadius: '50%',
    borderTopColor: 'var(--dt-primary, #0053fd)',
    height: 28,
    width: 28
  },
  spinnerSmall: {
    border: '2px solid color-mix(in srgb, var(--dt-primary, #0053fd) 20%, transparent)',
    borderRadius: '50%',
    borderTopColor: 'var(--dt-primary, #0053fd)',
    flex: '0 0 18px',
    height: 18,
    width: 18
  },
  state: {
    alignItems: 'center',
    color: 'color-mix(in srgb, var(--foreground) 74%, transparent)',
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    gap: 8,
    justifyContent: 'center',
    minHeight: 220,
    padding: 28,
    textAlign: 'center'
  },
  stateCopy: {
    color: 'color-mix(in srgb, var(--foreground) 45%, transparent)',
    fontSize: 12,
    lineHeight: 1.45,
    maxWidth: 210
  },
  time: {
    color: 'color-mix(in srgb, var(--foreground) 38%, transparent)',
    flexShrink: 0,
    fontSize: 10
  },
  title: {
    fontSize: 20,
    letterSpacing: '-0.025em',
    lineHeight: 1.05,
    margin: 0
  },
  visuallyHidden: {
    clip: 'rect(0 0 0 0)',
    clipPath: 'inset(50%)',
    height: 1,
    overflow: 'hidden',
    position: 'absolute',
    whiteSpace: 'nowrap',
    width: 1
  },
  workingBadge: {
    alignItems: 'center',
    color: 'var(--dt-primary, #0053fd)',
    display: 'flex',
    flexShrink: 0,
    fontSize: 10,
    fontWeight: 750,
    gap: 4
  },
  workingDot: {
    background: 'var(--dt-primary, #0053fd)',
    borderRadius: '50%',
    boxShadow: '0 0 8px color-mix(in srgb, var(--dt-primary, #0053fd) 70%, transparent)',
    height: 6,
    width: 6
  }
}
