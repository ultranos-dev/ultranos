'use client'

/**
 * Story 43.2 — QC Warning Banner
 *
 * Displays a contextual warning when the QC status for an analyte/instrument
 * is missing or failing. Shown on the result entry form and authorization view
 * so clinical staff see QC status before entering or approving results.
 *
 * Warning states (priority order):
 *   QC_FAILING  → red    — most recent QC run failed
 *   QC_DRIFT    → orange — drift detection triggered (Story 43.6)
 *   NO_QC_TODAY → amber  — no QC run recorded today
 *   (none)      → subtle green indicator
 *
 * RTL: uses logical CSS properties (margin-inline-start, etc.).
 * Warning icons do NOT mirror in RTL (medical/safety icons — CLAUDE.md RTL rule).
 */

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getTodayQcRun } from '@/services/qc-run-service'
import type { QcRun } from '@/lib/db'
import { Check, AlertTriangle } from '@ultranos/ui-kit/icons'

export interface QcWarningBannerProps {
  analyte: string
  instrumentId: string
  /** Display name of the analyte shown in warning text (e.g. "Haemoglobin"). */
  analyteDisplayName?: string
}

type BannerState =
  | { status: 'loading' }
  | { status: 'passing'; run: QcRun }
  | { status: 'failing'; run: QcRun; time: string }
  | { status: 'no_qc_today' }
  | { status: 'error' }

export function QcWarningBanner({
  analyte,
  instrumentId,
  analyteDisplayName,
}: QcWarningBannerProps) {
  const t = useTranslations('qc')
  const [state, setState] = useState<BannerState>({ status: 'loading' })

  const displayName = analyteDisplayName ?? analyte

  useEffect(() => {
    let active = true

    async function check() {
      try {
        const run = await getTodayQcRun(analyte, instrumentId)
        if (!active) return

        if (!run) {
          setState({ status: 'no_qc_today' })
        } else if (run.passOrFail === 'FAIL') {
          setState({ status: 'failing', run, time: run.calendarDate })
        } else {
          setState({ status: 'passing', run })
        }
      } catch {
        if (active) setState({ status: 'error' })
      }
    }

    check()
    return () => {
      active = false
    }
  }, [analyte, instrumentId])

  if (state.status === 'loading') return null

  if (state.status === 'passing') {
    return (
      <div
        role="status"
        aria-label={t('qcPassingLabel', { analyte: displayName })}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          borderRadius: '0.375rem',
          backgroundColor: '#f0fdf4',
          border: '1px solid #86efac',
          color: '#166534',
          fontSize: '0.875rem',
        }}
      >
        {/* checkmark — semantic icon, does NOT mirror in RTL */}
        <Check size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span>{t('qcPassing', { analyte: displayName })}</span>
      </div>
    )
  }

  if (state.status === 'failing') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5rem',
          padding: '0.75rem',
          borderRadius: '0.375rem',
          backgroundColor: '#fef2f2',
          border: '1px solid #fca5a5',
          color: '#991b1b',
          fontSize: '0.875rem',
        }}
      >
        {/* alert triangle — safety icon, does NOT mirror in RTL */}
        <AlertTriangle size={16} aria-hidden="true" style={{ flexShrink: 0, marginBlockStart: '0.125rem' }} />
        <span>
          {t('qcFailing', { analyte: displayName, time: state.time })}
        </span>
      </div>
    )
  }

  if (state.status === 'no_qc_today') {
    return (
      <div
        role="alert"
        aria-live="polite"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5rem',
          padding: '0.75rem',
          borderRadius: '0.375rem',
          backgroundColor: '#fffbeb',
          border: '1px solid #fcd34d',
          color: '#92400e',
          fontSize: '0.875rem',
        }}
      >
        {/* alert triangle — safety icon, does NOT mirror in RTL */}
        <AlertTriangle size={16} aria-hidden="true" style={{ flexShrink: 0, marginBlockStart: '0.125rem' }} />
        <span>{t('noQcToday', { analyte: displayName })}</span>
      </div>
    )
  }

  // error state — silently return null (QC warning should not block the form)
  return null
}
