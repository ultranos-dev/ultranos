'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ChevronRight } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { ProfileCard } from '@/components/settings/ProfileCard'
import { SessionInfoCard } from '@/components/settings/SessionInfoCard'
import { MfaManagementCard } from '@/components/settings/MfaManagementCard'
import { PreferencesCard } from '@/components/settings/PreferencesCard'
import { useDataBudgetStore } from '@/stores/data-budget-store'

export default function SettingsPage() {
  const t = useTranslations('dataBudget')
  const { planSizeMB, currentCycleUsedMB, thresholdLevel, isLoaded, loadFromDexie } = useDataBudgetStore()

  useEffect(() => {
    if (!isLoaded) void loadFromDexie()
  }, [isLoaded, loadFromDexie])

  const usedPct = planSizeMB > 0 ? Math.min((currentCycleUsedMB / planSizeMB) * 100, 100) : 0
  const barColor =
    thresholdLevel === 'critical' ? 'bg-red-500'
    : thresholdLevel === 'warning' ? 'bg-yellow-500'
    : 'bg-green-500'
  const textColor =
    thresholdLevel === 'critical' ? 'text-red-500'
    : thresholdLevel === 'warning' ? 'text-yellow-500'
    : 'text-muted-foreground'

  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <div className="px-6 pb-6 max-w-2xl space-y-6">
        <ProfileCard />
        <SessionInfoCard />
        <MfaManagementCard />
        <PreferencesCard />

        <Link
          href="/settings/data-budget"
          className="flex items-center justify-between rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50 transition-colors hover:bg-muted/50"
        >
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-foreground">{t('settingsTitle')}</span>
            {isLoaded && (
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 rounded-full bg-border overflow-hidden">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${usedPct}%` }} />
                </div>
                <span className={`text-xs ${textColor}`}>
                  {t('sidebarUsed', { used: currentCycleUsedMB.toFixed(0) })}
                </span>
              </div>
            )}
          </div>
          <DirectionalIcon category="navigation">
            <ChevronRight size={16} className="text-muted-foreground" />
          </DirectionalIcon>
        </Link>
      </div>
    </div>
  )
}
