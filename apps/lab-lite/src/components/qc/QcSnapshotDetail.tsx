'use client'

/**
 * Story 43.2 — QC Snapshot Detail
 *
 * Read-only display of the QcSnapshot attached to a patient result.
 * Shown in the result detail view as "QC Status at Time of Processing".
 * The snapshot is immutable — no edit controls.
 *
 * RTL: logical CSS properties. No PHI — QC data only.
 */

import { useTranslations } from 'next-intl'
import type { QcSnapshot, QcWarning } from '@/lib/db'

interface QcSnapshotDetailProps {
  qcSnapshot: QcSnapshot | null | undefined
  qcWarning: QcWarning
  resultDate?: string
}

export function QcSnapshotDetail({ qcSnapshot, qcWarning, resultDate }: QcSnapshotDetailProps) {
  const t = useTranslations('qc')

  if (!qcSnapshot) {
    return (
      <section
        aria-labelledby="qc-snapshot-heading"
        style={{
          padding: '0.75rem',
          borderRadius: '0.375rem',
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
        }}
      >
        <h3
          id="qc-snapshot-heading"
          style={{ fontSize: '0.875rem', fontWeight: 600, marginBlockEnd: '0.25rem' }}
        >
          {t('snapshot.heading')}
        </h3>
        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          {t('snapshot.noData')}
        </p>
      </section>
    )
  }

  // QC warning callout
  const warningContent = qcWarning ? (
    <div
      role="alert"
      style={{
        padding: '0.75rem',
        marginBlockEnd: '0.75rem',
        borderRadius: '0.375rem',
        backgroundColor: qcWarning === 'QC_FAILING' ? '#fef2f2' : qcWarning === 'QC_DRIFT' ? '#fff7ed' : '#fffbeb',
        border: `1px solid ${qcWarning === 'QC_FAILING' ? '#fca5a5' : qcWarning === 'QC_DRIFT' ? '#fdba74' : '#fcd34d'}`,
        color: qcWarning === 'QC_FAILING' ? '#991b1b' : qcWarning === 'QC_DRIFT' ? '#9a3412' : '#92400e',
        fontSize: '0.875rem',
      }}
    >
      {qcWarning === 'QC_FAILING' && t('snapshot.warningFailing', { analyte: qcSnapshot.analyte, date: resultDate ?? '' })}
      {qcWarning === 'QC_DRIFT' && t('snapshot.warningDrift', { analyte: qcSnapshot.analyte })}
      {qcWarning === 'NO_QC_TODAY' && t('snapshot.warningNoQc', { date: resultDate ?? '' })}
    </div>
  ) : null

  return (
    <section aria-labelledby="qc-snapshot-heading">
      <h3
        id="qc-snapshot-heading"
        style={{ fontSize: '0.875rem', fontWeight: 600, marginBlockEnd: '0.75rem' }}
      >
        {t('snapshot.heading')}
      </h3>

      {warningContent}

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
          gap: '0.5rem 1rem',
          fontSize: '0.875rem',
        }}
      >
        {[
          { label: t('snapshot.qcRunId'), value: qcSnapshot.qcRunId },
          { label: t('snapshot.analyte'), value: qcSnapshot.analyte },
          { label: t('snapshot.instrument'), value: qcSnapshot.instrumentId },
          { label: t('snapshot.controlLevel'), value: qcSnapshot.controlLevel },
          {
            label: t('snapshot.result'),
            value: (
              <span
                style={{
                  fontWeight: 700,
                  color: qcSnapshot.passOrFail === 'PASS' ? '#166534' : '#991b1b',
                }}
              >
                {qcSnapshot.passOrFail === 'PASS' ? t('result.pass') : t('result.fail')}
              </span>
            ),
          },
          {
            label: t('snapshot.controlValues'),
            value: Object.entries(qcSnapshot.controlValues)
              .map(([k, v]) => `${k}: ${v}`)
              .join(', '),
          },
          {
            label: t('snapshot.expectedRange'),
            value: `${qcSnapshot.expectedRange.low}–${qcSnapshot.expectedRange.high}`,
          },
          { label: t('snapshot.qcTimestamp'), value: qcSnapshot.qcTimestamp },
          { label: t('snapshot.snapshotTakenAt'), value: qcSnapshot.snapshotTakenAt },
        ].map(({ label, value }) => (
          <div key={label}>
            <dt style={{ color: '#6b7280', marginBlockEnd: '0.125rem' }}>{label}</dt>
            <dd style={{ margin: 0, color: '#111827', fontWeight: 500 }}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
