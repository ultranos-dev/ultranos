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
import { Card } from '@/components/Card'
import { useDataBudgetStore } from '@/stores/data-budget-store'

export default function SettingsPage() {
  const t = useTranslations('dataBudget')
  const { planSizeMB, currentCycleUsedMB, thresholdLevel, isLoaded, loadFromDexie } = useDataBudgetStore()

  useEffect(() => {
    if (!isLoaded) void loadFromDexie()
  }, [isLoaded, loadFromDexie])

  const usedPct = planSizeMB > 0 ? Math.min((currentCycleUsedMB / planSizeMB) * 100, 100) : 0
  const barColor =
    thresholdLevel === 'critical' ? 'bg-destructive'
    : thresholdLevel === 'warning' ? 'bg-warning'
    : 'bg-success'
  const textColor =
    thresholdLevel === 'critical' ? 'text-destructive'
    : thresholdLevel === 'warning' ? 'text-warning'
    : 'text-muted-foreground'

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-2xl flex flex-col gap-4">
        <ProfileCard />
        <SessionInfoCard />
        <MfaManagementCard />

        <Card
          as={Link}
          href="/settings/data-budget"
          className="flex items-center justify-between transition-colors hover:bg-muted/50"
        >
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-foreground">{t('settingsTitle')}</span>
            {isLoaded && (
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 rounded-full bg-border overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor}`}
                    style={{ width: `${usedPct}%` }}
                    role="progressbar"
                    aria-valuenow={Math.round(usedPct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={t('sidebarUsed', { used: currentCycleUsedMB.toFixed(0) })}
                  />
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
        </Card>

        <PreferencesCard />
      </div>
    </div>
  )
}
