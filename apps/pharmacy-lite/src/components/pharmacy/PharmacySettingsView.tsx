'use client'

import { useState, useEffect } from 'react'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'

function formatRole(role: string): string {
  if (!role) return 'Pharmacist'
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join('')
}

function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return '0:00'
  const hours = Math.floor(remainingMs / 3_600_000)
  const minutes = Math.floor((remainingMs % 3_600_000) / 60_000)
  const seconds = Math.floor((remainingMs % 60_000) / 1_000)
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function countdownColor(remainingMs: number): string {
  if (remainingMs > 60 * 60_000) return 'text-success'
  if (remainingMs > 15 * 60_000) return 'text-warning'
  return 'text-destructive'
}

const MAX_SESSION_MS = 12 * 60 * 60 * 1000 // 12 hours for pharmacist role

// --- Profile Card (Task 2) ---
function ProfileCard() {
  const session = useAuthSessionStore((s) => s.session)
  if (!session) return null

  const displayName = session.name || session.email?.split('@')[0] || 'Unknown'
  const initials = getInitials(displayName)

  return (
    <section className="rounded-2xl border border-border bg-card p-6" aria-labelledby="profile-heading">
      <h2 id="profile-heading" className="mb-4 text-sm font-semibold text-foreground">Profile</h2>
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
          {initials}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Name</p>
            <p className="text-sm text-foreground" data-testid="profile-name">{displayName}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Role</p>
            <span
              className="inline-block rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700"
              data-testid="profile-role"
            >
              {formatRole(session.role)}
            </span>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Email</p>
            <p className="text-sm text-foreground" data-testid="profile-email">{session.email || '\u2014'}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

// --- Pharmacy Info Card (Task 3) ---
function PharmacyInfoCard() {
  const session = useAuthSessionStore((s) => s.session)
  if (!session) return null

  return (
    <section className="rounded-2xl border border-border bg-card p-6" aria-labelledby="pharmacy-heading">
      <h2 id="pharmacy-heading" className="mb-4 text-sm font-semibold text-foreground">Pharmacy Info</h2>
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Pharmacy Name</p>
          <p className="text-sm text-foreground" data-testid="pharmacy-name">
            {session.pharmacyName || 'Not configured'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">License Reference</p>
          <p className="text-sm text-foreground" data-testid="license-ref">
            {session.licenseRef || 'Not configured'}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">These fields are managed by your organization administrator.</p>
    </section>
  )
}

// --- Session Info Card (Task 4) ---
function SessionInfoCard() {
  const session = useAuthSessionStore((s) => s.session)
  const [remainingMs, setRemainingMs] = useState<number | null>(null)

  const loginAtMs = session?.loginAt ? new Date(session.loginAt).getTime() : null

  useEffect(() => {
    if (!loginAtMs) return

    const update = () => {
      const elapsed = Date.now() - loginAtMs
      setRemainingMs(Math.max(0, MAX_SESSION_MS - elapsed))
    }
    update()
    const interval = setInterval(update, 1_000)
    return () => clearInterval(interval)
  }, [loginAtMs])

  if (!session) return null

  const loginTime = loginAtMs ? new Date(loginAtMs).toLocaleTimeString() : 'Unknown'

  return (
    <section className="rounded-2xl border border-border bg-card p-6" aria-labelledby="session-heading">
      <h2 id="session-heading" className="mb-4 text-sm font-semibold text-foreground">Session Info</h2>
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Login Time</p>
          <p className="text-sm text-foreground" data-testid="login-time">{loginTime}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Session Expiry</p>
          {remainingMs !== null ? (
            <p
              data-testid="session-countdown"
              className={`text-lg font-bold ${countdownColor(remainingMs)}`}
            >
              {formatCountdown(remainingMs)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Unavailable</p>
          )}
        </div>
      </div>
    </section>
  )
}

// --- MFA Status Card (Task 5) ---
function MfaStatusCard() {
  const [isEnrolled, setIsEnrolled] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    async function checkMfa() {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data, error: mfaError } = await supabase.auth.mfa.listFactors()
        if (active) {
          if (mfaError || !data?.totp) {
            setError(true)
          } else {
            const verifiedFactors = data.totp.filter(
              (f: { status: string }) => f.status === 'verified',
            )
            setIsEnrolled(verifiedFactors.length > 0)
          }
        }
      } catch {
        if (active) setError(true)
      } finally {
        if (active) setLoading(false)
      }
    }
    checkMfa()
    return () => { active = false }
  }, [])

  return (
    <section className="rounded-2xl border border-border bg-card p-6" aria-labelledby="mfa-heading">
      <h2 id="mfa-heading" className="mb-4 text-sm font-semibold text-foreground">MFA Status</h2>

      {loading && <p className="text-sm text-muted-foreground">Loading MFA status...</p>}

      {!loading && error && (
        <p className="text-sm text-warning" data-testid="mfa-error">Unable to check MFA status</p>
      )}

      {!loading && !error && isEnrolled !== null && (
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">TOTP Status</p>
          {isEnrolled ? (
            <span
              className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
              data-testid="mfa-status"
            >
              TOTP Enabled
            </span>
          ) : (
            <span
              className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning"
              data-testid="mfa-status"
            >
              Not Configured
            </span>
          )}
        </div>
      )}
    </section>
  )
}

// --- Main Settings View ---
export function PharmacySettingsView() {
  return (
    <div className="space-y-6" data-testid="pharmacy-settings-view">
      <ProfileCard />
      <PharmacyInfoCard />
      <SessionInfoCard />
      <MfaStatusCard />
    </div>
  )
}
