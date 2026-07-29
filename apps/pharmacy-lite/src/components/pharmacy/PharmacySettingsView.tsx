'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { ChevronRight } from '@ultranos/ui-kit/icons'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useDataBudgetStore } from '@/stores/data-budget-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'

function formatRole(role: string): string {
  if (!role) return 'Pharmacist'
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? '')
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

// --- Profile Card ---
function ProfileCard() {
  const t = useTranslations('settings')
  const session = useAuthSessionStore((s) => s.session)
  if (!session) return null

  const displayName = session.name || session.email?.split('@')[0] || 'Unknown'
  const initials = getInitials(displayName)

  return (
    <section className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50" aria-labelledby="profile-heading">
      <h2 id="profile-heading" className="mb-4 text-sm font-semibold text-foreground">{t('profile')}</h2>
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
          {initials}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t('name')}</p>
            <p className="text-sm text-foreground" data-testid="profile-name">{displayName}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t('role')}</p>
            <span
              className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
              data-testid="profile-role"
            >
              {formatRole(session.role)}
            </span>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t('emailLabel')}</p>
            <p className="text-sm text-foreground" data-testid="profile-email">{session.email || '\u2014'}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

// --- Pharmacy Info Card ---
function PharmacyInfoCard() {
  const t = useTranslations('settings')
  const session = useAuthSessionStore((s) => s.session)
  if (!session) return null

  return (
    <section className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50" aria-labelledby="pharmacy-heading">
      <h2 id="pharmacy-heading" className="mb-4 text-sm font-semibold text-foreground">{t('pharmacyInfo')}</h2>
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t('pharmacyName')}</p>
          <p className="text-sm text-foreground" data-testid="pharmacy-name">
            {session.pharmacyName || t('notConfigured')}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t('licenseRef')}</p>
          <p className="text-sm text-foreground" data-testid="license-ref">
            {session.licenseRef || t('notConfigured')}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t('adminManaged')}</p>
    </section>
  )
}

// --- Session Info Card ---
function SessionInfoCard() {
  const t = useTranslations('settings')
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

  const loginTime = loginAtMs ? new Date(loginAtMs).toLocaleTimeString() : t('unavailable')

  return (
    <section className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50" aria-labelledby="session-heading">
      <h2 id="session-heading" className="mb-4 text-sm font-semibold text-foreground">{t('sessionInfo')}</h2>
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t('loginTime')}</p>
          <p className="text-sm text-foreground" data-testid="login-time">{loginTime}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t('sessionExpiry')}</p>
          {remainingMs !== null ? (
            <p
              data-testid="session-countdown"
              className={`text-lg font-bold ${countdownColor(remainingMs)}`}
            >
              {formatCountdown(remainingMs)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('unavailable')}</p>
          )}
        </div>
      </div>
    </section>
  )
}

// --- MFA Status Card ---
function MfaStatusCard() {
  const t = useTranslations('settings')
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
    <section className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50" aria-labelledby="mfa-heading">
      <h2 id="mfa-heading" className="mb-4 text-sm font-semibold text-foreground">{t('mfaStatus')}</h2>

      {loading && <p className="text-sm text-muted-foreground">{t('loadingMfa')}</p>}

      {!loading && error && (
        <p className="text-sm text-warning" data-testid="mfa-error">{t('mfaCheckError')}</p>
      )}

      {!loading && !error && isEnrolled !== null && (
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">{t('totpStatus')}</p>
          {isEnrolled ? (
            <span
              className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
              data-testid="mfa-status"
            >
              {t('totpEnabled')}
            </span>
          ) : (
            <span
              className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning"
              data-testid="mfa-status"
            >
              {t('totpNotConfigured')}
            </span>
          )}
        </div>
      )}
    </section>
  )
}

// --- Data Budget Card ---
function DataBudgetCard() {
  const tData = useTranslations('dataBudget')
  const { planSizeMB, currentCycleUsedMB, thresholdLevel, isLoaded, loadFromDexie } = useDataBudgetStore()

  useEffect(() => {
    if (!isLoaded) void loadFromDexie()
  }, [isLoaded, loadFromDexie])

  const usedPct = planSizeMB > 0 ? Math.min((currentCycleUsedMB / planSizeMB) * 100, 100) : 0
  const barColor =
    thresholdLevel === 'critical' ? 'bg-destructive'
    : thresholdLevel === 'warning' ? 'bg-warning'
    : 'bg-success'

  return (
    <Link
      href="/settings/data-budget"
      className="flex items-center justify-between rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50 transition-colors hover:bg-muted/30"
      aria-label={tData('viewDashboard')}
    >
      <div className="flex flex-col gap-2 min-w-0">
        <h2 className="text-sm font-semibold text-foreground">{tData('settingsTitle')}</h2>
        <div className="flex items-center gap-2">
          <div className="w-24 h-1.5 rounded-full bg-border overflow-hidden">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${usedPct}%` }} />
          </div>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {tData('sidebarUsed', { used: currentCycleUsedMB.toFixed(0) })}
          </span>
        </div>
      </div>
      <DirectionalIcon category="navigation">
        <ChevronRight size={20} className="text-muted-foreground shrink-0" />
      </DirectionalIcon>
    </Link>
  )
}

// --- Main Settings View ---
export function PharmacySettingsView() {
  const t = useTranslations('settings')
  return (
    <div className="flex flex-col gap-4" data-testid="pharmacy-settings-view">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
      <ProfileCard />
      <PharmacyInfoCard />
      <SessionInfoCard />
      <MfaStatusCard />
      <DataBudgetCard />
    </div>
  )
}
