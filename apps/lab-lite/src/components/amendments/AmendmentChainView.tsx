'use client'

/**
 * Story 43.3 — Task 8.4-8.5: Amendment Chain View
 *
 * Displays a chronological list of all amendments for a given original report.
 * Each chain entry shows: version number, actor, timestamp, reason, diff summary.
 *
 * RTL support: all layout uses logical CSS properties (AC #8, task 4.8).
 * CLAUDE.md Rule #7: No PHI — only opaque IDs and reason codes are shown.
 */

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import type { AmendmentRecord } from '@ultranos/shared-types'
import { AmendmentReasonCode } from '@ultranos/shared-types'
import { getAmendmentChain } from '@/lib/amendment-service'

interface AmendmentChainViewProps {
  /** The root original report ID to load the amendment chain for */
  originalReportId: string
}

const REASON_CODE_LABELS: Record<AmendmentReasonCode, string> = {
  [AmendmentReasonCode.CLERICAL_ERROR]: 'Clerical Error',
  [AmendmentReasonCode.INSTRUMENT_MALFUNCTION]: 'Instrument Malfunction',
  [AmendmentReasonCode.WRONG_PATIENT]: 'Wrong Patient',
  [AmendmentReasonCode.QC_FAILURE_POST_RELEASE]: 'QC Failure Post-Release',
  [AmendmentReasonCode.TRANSCRIPTION_ERROR]: 'Transcription Error',
  [AmendmentReasonCode.OTHER]: 'Other',
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/**
 * Renders the full amendment chain for a lab result, ordered chronologically.
 * Each entry shows version number, initiator ID, supervisor ID, timestamp, reason.
 *
 * AC #6: The full amendment chain is visible in the audit trail.
 */
export function AmendmentChainView({ originalReportId }: AmendmentChainViewProps) {
  const tCommon = useTranslations('common')
  const t = useTranslations('amendments')
  const [chain, setChain] = useState<AmendmentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const result = await getAmendmentChain(originalReportId)
        if (!cancelled) {
          setChain(result)
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load amendment chain')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => { cancelled = true }
  }, [originalReportId])

  if (loading) {
    return (
      <div className="py-4 text-sm text-gray-500" data-testid="chain-loading">
        {tCommon('loading')}
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-4 text-sm text-red-600" role="alert" data-testid="chain-error">
        {error}
      </div>
    )
  }

  if (chain.length === 0) {
    return (
      <div className="py-4 text-sm text-gray-500" data-testid="chain-empty">
        No amendments on record for this result.
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="amendment-chain">
      <h3 className="text-sm font-medium text-gray-700">
        Amendment History ({chain.length} {chain.length === 1 ? 'amendment' : 'amendments'})
      </h3>

      <ol className="relative border-s border-gray-200 ms-4 space-y-4">
        {chain.map((amendment, index) => (
          <li key={amendment.id} className="ms-4" data-testid={`chain-entry-${index}`}>
            {/* Timeline dot */}
            <div className="absolute -start-1.5 w-3 h-3 rounded-full bg-blue-600 border-2 border-white" />

            <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-sm">
              {/* Version header */}
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900">
                  Amendment v{index + 1}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    amendment.status === 'COMMITTED'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {amendment.status === 'COMMITTED' ? 'Committed' : 'Pending Authorization'}
                </span>
              </div>

              {/* Reason */}
              <div className="space-y-1 text-gray-700">
                <div className="flex gap-2">
                  <span className="font-medium w-28 shrink-0">Reason:</span>
                  <span>
                    {amendment.reasonCode
                      ? REASON_CODE_LABELS[amendment.reasonCode] ?? amendment.reasonCode
                      : '—'}
                  </span>
                </div>

                {amendment.reasonText && (
                  <div className="flex gap-2">
                    <span className="font-medium w-28 shrink-0">Explanation:</span>
                    <span className="text-gray-600">{amendment.reasonText}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <span className="font-medium w-28 shrink-0">Initiated by:</span>
                  <span className="font-mono text-xs text-gray-500">{amendment.initiatedBy}</span>
                </div>

                {amendment.authorizedBy && (
                  <div className="flex gap-2">
                    <span className="font-medium w-28 shrink-0">Authorized by:</span>
                    <span className="font-mono text-xs text-gray-500">{amendment.authorizedBy}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <span className="font-medium w-28 shrink-0">Initiated:</span>
                  <span className="text-gray-500">{formatTimestamp(amendment.initiatedAt)}</span>
                </div>

                {amendment.authorizedAt && (
                  <div className="flex gap-2">
                    <span className="font-medium w-28 shrink-0">Authorized:</span>
                    <span className="text-gray-500">{formatTimestamp(amendment.authorizedAt)}</span>
                  </div>
                )}

                {/* Diff summary */}
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <p className="text-xs font-medium text-gray-600 mb-1">Diff summary (value types changed):</p>
                  <div className="font-mono text-xs text-gray-500">
                    {Object.keys(amendment.originalValues).length > 0 || Object.keys(amendment.amendedValues).length > 0
                      ? Object.keys({ ...amendment.originalValues, ...amendment.amendedValues }).map((key) => (
                          <div key={key}>
                            {key}: [original] → [corrected]
                          </div>
                        ))
                      : <span>{t('noValueDiff')}</span>
                    }
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
