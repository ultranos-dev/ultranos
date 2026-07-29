'use client'

/**
 * Story 43.2 — QC Dashboard Page
 * Route: /[locale]/qc
 *
 * Shows:
 * 1. QC run entry form
 * 2. QC history / Levey-Jennings trend for selected analyte/instrument
 * 3. Today's QC status summary across configured analytes
 *
 * No PHI — QC data is purely operational.
 * RTL: logical CSS properties throughout.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { QcRunEntryForm } from '@/components/qc/QcRunEntryForm'
import { QcHistoryView } from '@/components/qc/QcHistoryView'
import type { QcRun } from '@/lib/db'

export default function QcDashboardPage() {
  const t = useTranslations('qc')

  // After a run is saved, show history for that analyte/instrument
  const [lastSaved, setLastSaved] = useState<{ analyte: string; instrumentId: string } | null>(
    null,
  )

  function handleSaved(run: QcRun) {
    setLastSaved({ analyte: run.analyte, instrumentId: run.instrumentId })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">{t('dashboard.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
      </div>

      {/* QC Run Entry */}
      <section className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <QcRunEntryForm onSaved={handleSaved} />
      </section>

      {/* QC History for last saved analyte/instrument */}
      {lastSaved && (
        <section className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
          <QcHistoryView
            analyte={lastSaved.analyte}
            instrumentId={lastSaved.instrumentId}
            analyteDisplayName={lastSaved.analyte}
          />
        </section>
      )}

      {!lastSaved && (
        <p className="text-sm text-muted-foreground">{t('dashboard.noHistoryHint')}</p>
      )}
    </div>
  )
}
