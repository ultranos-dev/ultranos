'use client'

/**
 * SurveillanceDashboard — Story 50.3: Automated Disease Surveillance Alerts
 *
 * Full-page surveillance alert history dashboard.
 * Wraps SurveillanceAlertList with page title, alert history navigation link.
 *
 * No PHI — all data is aggregate counts, rates, and lab metadata.
 */

import { useTranslations } from 'next-intl'
import { Shield } from '@ultranos/ui-kit/icons'
import { SurveillanceAlertList } from './SurveillanceAlertList'

interface SurveillanceDashboardProps {
  highlightAlertId?: string
}

export function SurveillanceDashboard({ highlightAlertId }: SurveillanceDashboardProps) {
  const t = useTranslations('surveillance')

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="mb-6 flex items-center gap-3">
        <Shield size={24} className="text-primary-600 shrink-0" aria-hidden />
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('alertHistory')}</p>
        </div>
      </div>

      <SurveillanceAlertList highlightAlertId={highlightAlertId} />
    </div>
  )
}
