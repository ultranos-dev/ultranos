'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { ChevronLeft } from '@ultranos/ui-kit/icons'
import { ThresholdConfigPanel } from '@/components/escalation/ThresholdConfigPanel'
import { EscalationContactsPanel } from '@/components/escalation/EscalationContactsPanel'

export default function CriticalValuesSettingsPage() {
  const t = useTranslations('settings')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          className="text-muted-foreground hover:text-foreground"
          aria-label={t('backToSettings')}
        >
          <DirectionalIcon category="navigation">
            <ChevronLeft size={20} />
          </DirectionalIcon>
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">{t('criticalValues')}</h1>
      </div>

      {/* Thresholds */}
      <section>
        <ThresholdConfigPanel />
      </section>

      {/* Escalation Contacts */}
      <section>
        <EscalationContactsPanel />
      </section>
    </div>
  )
}
