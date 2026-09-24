import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { triggerHaptic } from '@/lib/haptics'
import { $gateway } from '@/store/gateway'
import { $approvalRequest, type ApprovalRequest, clearApprovalRequest } from '@/store/prompts'

import { isolateBodyChildren } from './modal-isolation'

type ApprovalChoice = 'once' | 'session' | 'always' | 'deny'

/**
 * Blocking, phone-first approval surface.
 *
 * Unlike an informational tool sheet this cannot be dismissed with the backdrop
 * or Escape: the gateway is synchronously waiting for approval.respond, so
 * disappearing without a decision would strand the turn until its timeout.
 */
export function MobileApprovalSheet() {
  const request = useStore($approvalRequest)

  if (!request) {
    return null
  }

  return <ApprovalSheetBody key={`${request.sessionId ?? ''}:${request.command}`} request={request} />
}

function ApprovalSheetBody({ request }: { request: ApprovalRequest }) {
  const gateway = useStore($gateway)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const confirmationBackRef = useRef<HTMLButtonElement | null>(null)
  const primaryRef = useRef<HTMLButtonElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const [submitting, setSubmitting] = useState<ApprovalChoice | null>(null)
  const [confirmAlways, setConfirmAlways] = useState(false)
  const [error, setError] = useState('')
  const busy = submitting !== null
  const allowPermanent = request.allowPermanent !== false

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    primaryRef.current?.focus()
    const releaseIsolation = isolateBodyChildren(child => child === dialogRef.current)

    return () => {
      releaseIsolation()
      restoreFocusRef.current?.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    if (confirmAlways) {
      confirmationBackRef.current?.focus()
    }
  }, [confirmAlways])

  const respond = useCallback(
    async (choice: ApprovalChoice) => {
      if (busy || !$approvalRequest.get()) {
        return
      }

      if (!gateway) {
        setError('The gateway disconnected. Reconnect before deciding.')

        return
      }

      setError('')
      setSubmitting(choice)

      try {
        await gateway.request<{ resolved?: boolean }>('approval.respond', {
          choice,
          session_id: request.sessionId ?? undefined
        })
        triggerHaptic(choice === 'deny' ? 'cancel' : 'submit')
        clearApprovalRequest(request.sessionId)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not send the decision. Try again.')
        setSubmitting(null)
      }
    },
    [busy, gateway, request.sessionId]
  )

  // Hardware keyboards are useful with DeX/Chromebook, but Escape deliberately
  // does nothing: a rejection must be an explicit tap, never an accidental
  // dismissal gesture.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()

        return
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]'))
        const first = controls[0]
        const last = controls.at(-1)

        if (first && last && !dialogRef.current.contains(document.activeElement)) {
          event.preventDefault()
          const target = event.shiftKey ? last : first
          target.focus()
        } else if (first && last && event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (first && last && !event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }

        return
      }

      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !confirmAlways) {
        event.preventDefault()
        void respond('once')
      }
    }

    window.addEventListener('keydown', onKeyDown, true)

    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [confirmAlways, respond])

  return createPortal(
    <div
      aria-label="Approval required"
      aria-modal="true"
      data-mobile-approval
      data-testid="mobile-approval-backdrop"
      ref={dialogRef}
      role="dialog"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'flex-end',
        background: 'rgba(0, 0, 0, 0.66)'
      }}
    >
      <section
        style={{
          width: '100%',
          maxHeight: 'min(88dvh, 760px)',
          overflowY: 'auto',
          borderTop: '1px solid var(--dt-border, #3a3a44)',
          borderRadius: '18px 18px 0 0',
          background: 'var(--background, #0b0b0c)',
          color: 'var(--foreground, #e7e7ea)',
          padding: '14px 14px max(14px, env(safe-area-inset-bottom))',
          boxShadow: '0 -18px 60px rgba(0, 0, 0, 0.45)'
        }}
      >
        <div aria-hidden style={{ width: 42, height: 4, borderRadius: 999, margin: '0 auto 14px', background: 'var(--dt-border, #555)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span aria-hidden style={{ color: 'var(--dt-warning, #f7b955)', fontSize: 20 }}>⚠</span>
          <div>
            <strong style={{ display: 'block', fontSize: 17 }}>Approval required</strong>
            <span style={{ display: 'block', marginTop: 2, opacity: 0.68, fontSize: 12 }}>
              Hermes is paused until you decide.
            </span>
          </div>
        </div>

        {request.description.trim() && (
          <p style={{ margin: '14px 0 8px', fontSize: 14, lineHeight: 1.45 }}>{request.description.trim()}</p>
        )}

        <div style={{ marginTop: 10 }}>
          <div style={{ marginBottom: 6, opacity: 0.62, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Full command
          </div>
          <pre
            data-testid="mobile-approval-command"
            style={{
              margin: 0,
              maxHeight: '34dvh',
              overflow: 'auto',
              whiteSpace: 'pre',
              wordBreak: 'normal',
              border: '1px solid var(--dt-border, #3a3a44)',
              borderRadius: 10,
              background: 'var(--dt-card, #151519)',
              padding: '12px',
              fontFamily: 'var(--dt-font-mono, ui-monospace, monospace)',
              fontSize: 13,
              lineHeight: 1.5
            }}
          >
            {request.command.trim() || '(command unavailable)'}
          </pre>
        </div>

        {error && (
          <div role="alert" style={{ marginTop: 10, color: 'var(--dt-destructive, #ff8383)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {confirmAlways ? (
          <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--dt-destructive, #a84949)', borderRadius: 10 }}>
            <strong style={{ display: 'block', fontSize: 14 }}>Always allow commands matching this rule?</strong>
            <p style={{ margin: '6px 0 12px', opacity: 0.72, fontSize: 13, lineHeight: 1.4 }}>
              This changes Hermes configuration permanently. Use “Allow this session” if you only need it for the current chat.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                disabled={busy}
                onClick={() => setConfirmAlways(false)}
                ref={confirmationBackRef}
                style={secondaryButton}
                type="button"
              >
                Back
              </button>
              <button disabled={busy} onClick={() => void respond('always')} style={dangerButton} type="button">
                {submitting === 'always' ? 'Saving…' : 'Confirm always'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            <button disabled={busy} onClick={() => void respond('once')} ref={primaryRef} style={primaryButton} type="button">
              {submitting === 'once' ? 'Running…' : 'Allow once'}
            </button>
            <button disabled={busy} onClick={() => void respond('session')} style={secondaryButton} type="button">
              {submitting === 'session' ? 'Allowing…' : 'Allow this session'}
            </button>
            {allowPermanent && (
              <button disabled={busy} onClick={() => setConfirmAlways(true)} style={secondaryButton} type="button">
                Always allow…
              </button>
            )}
            <button disabled={busy} onClick={() => void respond('deny')} style={dangerButton} type="button">
              {submitting === 'deny' ? 'Denying…' : 'Deny'}
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body
  )
}

const baseButton: React.CSSProperties = {
  minHeight: 48,
  borderRadius: 10,
  padding: '11px 14px',
  fontSize: 15,
  fontWeight: 700
}

const primaryButton: React.CSSProperties = {
  ...baseButton,
  border: '1px solid var(--dt-primary, #4a7fd0)',
  background: 'var(--dt-primary, #4a7fd0)',
  color: '#fff'
}

const secondaryButton: React.CSSProperties = {
  ...baseButton,
  border: '1px solid var(--dt-border, #3a3a44)',
  background: 'var(--dt-secondary, #27272e)',
  color: 'inherit'
}

const dangerButton: React.CSSProperties = {
  ...baseButton,
  border: '1px solid var(--dt-destructive, #a84949)',
  background: 'color-mix(in srgb, var(--dt-destructive, #a84949) 24%, var(--dt-card, #17171a))',
  color: 'var(--dt-destructive-foreground, #ffb3b3)'
}
