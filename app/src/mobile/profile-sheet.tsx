import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import {
  $activeGatewayProfile,
  $newChatProfile,
  $profiles,
  normalizeProfileKey,
  refreshProfiles,
  selectProfile
} from '@/store/profile'

/**
 * Profile switcher.
 *
 * How this actually works is worth stating, because the obvious assumption is
 * wrong: the dashboard process is scoped to ONE profile via HERMES_HOME (here,
 * `default`), and `POST /api/profiles/active` explicitly does not retarget a
 * running process. Switching is NOT per-socket.
 *
 * It is per SESSION. `session.create` takes a `profile` param — the gateway's
 * "app-global remote mode" — resolves that profile's home, stores it on the
 * session, and re-binds HERMES_HOME around every turn so config, skills, model
 * and state.db all resolve to that profile. `selectProfile()` sets
 * `$newChatProfile`, which `createBackendSessionForSend` already passes through.
 *
 * Consequence: a switch applies to the NEXT session, which is why
 * `selectProfile` also requests a fresh session. It cannot move an existing
 * conversation to another profile, and nothing here pretends otherwise.
 */
export function ProfileSheet({ onClose }: { onClose: () => void }) {
  const profiles = useStore($profiles)
  const activeGateway = useStore($activeGatewayProfile)
  const newChatProfile = useStore($newChatProfile)
  const [error, setError] = useState('')

  // Re-fetch on open so a profile created elsewhere shows up, matching the
  // desktop dropdown's behaviour.
  useEffect(() => {
    refreshProfiles().catch(() => setError('Could not load profiles.'))
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const current = normalizeProfileKey(newChatProfile ?? activeGateway)

  const choose = (name: string) => {
    selectProfile(name)
    onClose()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'flex-end'
      }}
    >
      <div
        onClick={event => event.stopPropagation()}
        style={{
          width: '100%',
          maxHeight: '80dvh',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: 'var(--dt-popover, #141417)',
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          border: '1px solid var(--dt-border, #26262b)',
          padding: 14,
          paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
          color: 'var(--foreground, #e7e7ea)'
        }}
      >
        <div
          aria-hidden
          style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--dt-border, #3a3a44)', alignSelf: 'center' }}
        />

        <header style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <strong style={{ fontSize: 15 }}>Profile</strong>
          <span style={{ opacity: 0.55, fontSize: 12 }}>applies to the next chat</span>
        </header>

        {error && <p style={{ color: 'var(--dt-destructive, #ff8383)', fontSize: 13, margin: 0 }}>{error}</p>}

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
          {profiles.length === 0 && !error && (
            <p style={{ opacity: 0.5, fontSize: 13, margin: 0 }}>Loading profiles…</p>
          )}

          {profiles.map(profile => {
            const selected = normalizeProfileKey(profile.name) === current

            return (
              <button
                aria-current={selected}
                key={profile.name}
                onClick={() => choose(profile.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  minHeight: 52,
                  padding: '10px 12px',
                  background: selected
                    ? 'color-mix(in srgb, var(--dt-primary, #4a7fd0) 18%, var(--dt-card, #17171a))'
                    : 'var(--dt-card, #17171a)',
                  border: '1px solid var(--dt-border, #26262b)',
                  borderRadius: 10,
                  color: 'inherit',
                  font: 'inherit',
                  fontSize: 14,
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
                type="button"
              >
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>{profile.name}</span>
                  {(profile.model || profile.provider) && (
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        opacity: 0.55,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {[profile.provider, profile.model].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>

                {selected && (
                  <span aria-hidden style={{ flex: '0 0 auto', color: 'var(--dt-primary, #8ab4ff)' }}>
                    ✓
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <button
          onClick={onClose}
          style={{
            minHeight: 44,
            background: 'var(--dt-secondary, #2a2a31)',
            border: '1px solid var(--dt-border, #3a3a44)',
            borderRadius: 8,
            color: 'inherit',
            font: 'inherit',
            fontSize: 14,
            cursor: 'pointer'
          }}
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
