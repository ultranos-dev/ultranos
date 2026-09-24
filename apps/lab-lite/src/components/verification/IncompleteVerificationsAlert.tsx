'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getIncompleteVerifications } from '@/lib/db'
import type { PatientVerificationRecord } from '@ultranos/shared-types'

/**
 * IncompleteVerificationsAlert — supervisor dashboard filter component (AC 4.4).
 *
 * Reads all incomplete verification records from Dexie and displays a collapsible
 * alert listing the affected sample IDs. Renders nothing when all verifications
 * are complete (no-noise principle).
 *
 * On load error: shows a visible error indicator so the supervisor is NOT
 * misled into thinking all verifications are complete (safety requirement).
 *
 * PHI: only sampleId (opaque) is shown — never patient name or ID number.
 */
export function IncompleteVerificationsAlert() {
  const t = useTranslations()
  const [records, setRecords] = useState<PatientVerificationRecord[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    getIncompleteVerifications()
      .then((data) => {
        setRecords(data)
        setLoadError(false)
      })
      .catch(() => {
        // Do NOT mask a load error as "no incomplete verifications" — that would be a
        // false-negative safety failure. Surface the error visibly instead.
        setLoadError(true)
      })
  }, [])

  if (loadError) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        data-testid="incomplete-verifications-error"
      >
        {t('verification.supervisor.loadError')}
      </div>
    )
  }

  if (records.length === 0) return null

  return (
    <div
      role="alert"
      className="rounded-xl border border-warning/30 bg-warning/10 p-4 space-y-2"
      data-testid="incomplete-verifications-alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-warning text-lg leading-none">⚠</span>
          <p className="text-sm font-semibold text-warning">
            {t('verification.supervisor.incompleteCount', { count: records.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="text-xs text-warning underline hover:text-warning focus:outline-none focus-visible:ring-2 focus-visible:ring-warning rounded"
          aria-expanded={expanded}
          aria-controls="incomplete-verifications-list"
          data-testid="incomplete-verifications-toggle"
        >
          {expanded ? t('verification.supervisor.collapse') : t('verification.supervisor.expand')}
        </button>
      </div>

      {expanded && (
        <ul
          id="incomplete-verifications-list"
          className="space-y-1 ps-4"
          data-testid="incomplete-verifications-list"
        >
          {records.map((rec) => (
            <li key={rec.id} className="text-xs text-warning font-mono">
              {rec.sampleId}
              {rec.deviationReason && (
                <span className="ms-2 font-sans font-normal text-warning">
                  — {rec.deviationReason}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
