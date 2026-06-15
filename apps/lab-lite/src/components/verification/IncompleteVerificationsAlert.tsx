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
 * PHI: only sampleId (opaque) is shown — never patient name or ID number.
 */
export function IncompleteVerificationsAlert() {
  const t = useTranslations()
  const [records, setRecords] = useState<PatientVerificationRecord[]>([])
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    getIncompleteVerifications()
      .then(setRecords)
      .catch(() => setRecords([]))
  }, [])

  if (records.length === 0) return null

  return (
    <div
      role="alert"
      className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 space-y-2"
      data-testid="incomplete-verifications-alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-yellow-600 text-lg leading-none">⚠</span>
          <p className="text-sm font-semibold text-yellow-800">
            {t('verification.supervisor.incompleteCount', { count: records.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="text-xs text-yellow-700 underline hover:text-yellow-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500 rounded"
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
            <li key={rec.id} className="text-xs text-yellow-800 font-mono">
              {rec.sampleId}
              {rec.deviationReason && (
                <span className="ms-2 font-sans font-normal text-yellow-700">
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
