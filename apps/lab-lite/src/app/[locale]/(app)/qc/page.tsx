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
    <main
      style={{
        maxWidth: '60rem',
        marginInline: 'auto',
        padding: '1.5rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
      }}
    >
      <header>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBlock: 0 }}>
          {t('dashboard.title')}
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBlockStart: '0.25rem' }}>
          {t('dashboard.subtitle')}
        </p>
      </header>

      {/* QC Run Entry */}
      <section
        style={{
          padding: '1.25rem',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          backgroundColor: '#fff',
        }}
      >
        <QcRunEntryForm onSaved={handleSaved} />
      </section>

      {/* QC History for last saved analyte/instrument */}
      {lastSaved && (
        <section
          style={{
            padding: '1.25rem',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
            backgroundColor: '#fff',
          }}
        >
          <QcHistoryView
            analyte={lastSaved.analyte}
            instrumentId={lastSaved.instrumentId}
            analyteDisplayName={lastSaved.analyte}
          />
        </section>
      )}

      {!lastSaved && (
        <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
          {t('dashboard.noHistoryHint')}
        </p>
      )}
    </main>
  )
}
