'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

export interface ReAuthModalProps {
  userEmail: string
  onReAuth: (password: string) => Promise<boolean>
  onSignOut: () => void
  /** Seconds until automatic sign-out. Defaults to 300 (5 minutes). */
  autoSignOutSeconds?: number
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function ReAuthModal({ userEmail, onReAuth, onSignOut, autoSignOutSeconds = 300 }: ReAuthModalProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [countdown, setCountdown] = useState(autoSignOutSeconds)
  const modalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto sign-out countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          onSignOut()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [onSignOut])

  // Focus the password input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Focus trap and ESC → Sign Out
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onSignOut()
        return
      }
      if (e.key !== 'Tab') return
      const modal = modalRef.current
      if (!modal) return
      const focusable = modal.querySelectorAll<HTMLElement>(
        'input, button, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onSignOut])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (submitting || !password) return
      setError('')
      setSubmitting(true)
      try {
        const success = await onReAuth(password)
        if (!success) {
          setError('Invalid password. Please try again.')
          setPassword('')
        }
      } catch {
        setError('Authentication failed. Please try again.')
        setPassword('')
      } finally {
        setSubmitting(false)
      }
    },
    [password, submitting, onReAuth]
  )

  const titleId = 'reauth-modal-title'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          padding: '1.5rem',
          maxWidth: '24rem',
          width: '100%',
          boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
        }}
      >
        <h2
          id={titleId}
          style={{
            fontSize: '1.125rem',
            fontWeight: 700,
            marginBottom: '0.25rem',
            color: '#1a1a1a',
          }}
        >
          Session Locked
        </h2>
        <p
          style={{
            fontSize: '0.875rem',
            color: '#525252',
            marginBottom: '0.5rem',
          }}
        >
          Please re-enter your password to continue as{' '}
          <strong>{userEmail}</strong>
        </p>
        <p
          aria-live="polite"
          aria-atomic="true"
          style={{
            fontSize: '0.8125rem',
            color: countdown <= 60 ? '#dc2626' : '#b45309',
            fontVariantNumeric: 'tabular-nums',
            marginBottom: '1rem',
          }}
        >
          You will be signed out in{' '}
          <strong>{formatCountdown(countdown)}</strong>
        </p>

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="reauth-password"
            style={{
              display: 'block',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#525252',
              marginBottom: '0.25rem',
            }}
          >
            Password
          </label>
          <input
            ref={inputRef}
            id="reauth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              fontSize: '0.875rem',
              border: '1px solid #d4d4d4',
              borderRadius: '0.375rem',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />

          {error && (
            <p
              role="alert"
              style={{
                fontSize: '0.75rem',
                color: '#dc2626',
                marginTop: '0.5rem',
              }}
            >
              {error}
            </p>
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              marginTop: '1rem',
            }}
          >
            <button
              type="submit"
              disabled={submitting || !password}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#fff',
                backgroundColor: submitting ? '#93c5fd' : '#2563eb',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Verifying...' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={onSignOut}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#dc2626',
                backgroundColor: 'transparent',
                border: '1px solid #dc2626',
                borderRadius: '0.5rem',
                cursor: 'pointer',
              }}
            >
              Sign Out
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
