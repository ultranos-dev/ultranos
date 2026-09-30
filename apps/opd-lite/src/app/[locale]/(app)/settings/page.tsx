'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ProfileCard } from '@/components/settings/ProfileCard'
import { SessionInfoCard } from '@/components/settings/SessionInfoCard'
import { MfaManagementCard } from '@/components/settings/MfaManagementCard'
import { PreferencesCard } from '@/components/settings/PreferencesCard'
import { Button } from '@/components/ui/Button'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useDataBudgetStore } from '@/stores/data-budget-store'
import { triggerDrain } from '@/lib/sync-worker'

function formatRole(role: string): string {
  if (!role) return 'Clinician'
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
}

export default function SettingsPage() {
  const tSettings = useTranslations('settings')
  const session = useAuthSessionStore((s) => s.session)
  const { currentCycleUsedMB, isLoaded, loadFromDexie } = useDataBudgetStore()
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (!isLoaded) void loadFromDexie()
  }, [isLoaded, loadFromDexie])

  const sections = [
    { id: 'settings-profile', label: tSettings('navProfile') },
    { id: 'settings-security', label: tSettings('navSecurity') },
    { id: 'settings-data', label: tSettings('navData') },
    { id: 'settings-preferences', label: tSettings('navPreferences') },
  ]
  const [activeSection, setActiveSection] = useState('settings-profile')
  const goToSection = (id: string) => {
    setActiveSection(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const displayName = session?.name || session?.email?.split('@')[0] || ''
  const subtitle = session ? `${displayName} · ${formatRole(session.role)}` : ''

  const handleSyncNow = async () => {
    setSyncing(true)
    try {
      await triggerDrain()
      await loadFromDexie()
    } catch {
      // Best-effort — surface nothing; sync worker handles its own retry/backoff
    } finally {
      setSyncing(false)
    }
  }

  const cardClass =
    'overflow-hidden rounded-2xl border border-border bg-card shadow-card'
  const headingClass =
    'border-b border-border px-[18px] py-4 text-[15px] font-bold text-foreground'
  const rowClass =
    'flex items-center justify-between gap-3 px-[18px] py-[14px]'

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Floating command island: title + subtitle + section jump-nav */}
      <section className="sticky top-[4.5rem] z-20 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_6px_24px_-12px_rgba(0,0,0,0.18)]">
        <div className="px-4 pt-3">
          <h1 className="text-lg font-bold text-foreground">{tSettings('title')}</h1>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground" dir="auto">{subtitle}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 px-3 pb-3 pt-3" role="tablist" aria-label={tSettings('title')}>
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={activeSection === s.id}
              onClick={() => goToSection(s.id)}
              className={`h-9 rounded-full px-4 text-sm font-semibold transition-colors ${
                activeSection === s.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      {/* Profile */}
      <div id="settings-profile" className="scroll-mt-24">
        <ProfileCard />
      </div>

      {/* Security & MFA — single card composing the TOTP row + active-session row */}
      <div id="settings-security" className={`${cardClass} scroll-mt-24`}>
        <h3 className={headingClass}>{tSettings('navSecurity')}</h3>
        <MfaManagementCard variant="row" />
        <SessionInfoCard variant="row" />
      </div>

      {/* Data & sync */}
      <div id="settings-data" className={`${cardClass} scroll-mt-24`}>
        <h3 className={headingClass}>{tSettings('navData')}</h3>
        <Link
          href="/settings/data-budget"
          className={`${rowClass} border-t border-border transition-colors hover:bg-muted/50`}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{tSettings('localDataBudget')}</p>
            <p className="text-xs text-muted-foreground">{tSettings('dataBudgetHelper')}</p>
          </div>
          <span className="shrink-0 text-sm font-mono text-muted-foreground">
            {tSettings('mbUsed', { used: isLoaded ? currentCycleUsedMB.toFixed(0) : '0' })}
          </span>
        </Link>
        <div className={`${rowClass} border-t border-border`}>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{tSettings('syncStatus')}</p>
            <p className="text-xs text-muted-foreground">
              {tSettings('syncStatusHelper', { when: tSettings('syncJustNow') })}
            </p>
          </div>
          <Button
            variant="outline"
            type="button"
            onClick={handleSyncNow}
            disabled={syncing}
            className="h-9 shrink-0"
          >
            {syncing ? tSettings('syncing') : tSettings('syncNow')}
          </Button>
        </div>
      </div>

      {/* Preferences */}
      <div id="settings-preferences" className="scroll-mt-24">
        <PreferencesCard />
      </div>
    </div>
  )
}
