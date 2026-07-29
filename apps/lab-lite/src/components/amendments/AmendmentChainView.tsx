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

// REASON_CODE_LABELS moved into component to use translations

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

  // reasonCodeShort uses the short display labels for the chain view
  const REASON_CODE_LABELS: Record<AmendmentReasonCode, string> = {
    [AmendmentReasonCode.CLERICAL_ERROR]: t('reasonCodeShort.CLERICAL_ERROR'),
    [AmendmentReasonCode.INSTRUMENT_MALFUNCTION]: t('reasonCodeShort.INSTRUMENT_MALFUNCTION'),
    [AmendmentReasonCode.WRONG_PATIENT]: t('reasonCodeShort.WRONG_PATIENT'),
    [AmendmentReasonCode.QC_FAILURE_POST_RELEASE]: t('reasonCodeShort.QC_FAILURE_POST_RELEASE'),
    [AmendmentReasonCode.TRANSCRIPTION_ERROR]: t('reasonCodeShort.TRANSCRIPTION_ERROR'),
    [AmendmentReasonCode.OTHER]: t('reasonCodeShort.OTHER'),
  }
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
          setError(t('loadError'))
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
      <div className="py-4 text-sm text-muted-foreground" data-testid="chain-loading">
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
      <div className="py-4 text-sm text-muted-foreground" data-testid="chain-empty">
        {t('noAmendments')}
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="amendment-chain">
      <h3 className="text-sm font-medium text-foreground">
        {t('historyTitle', { count: chain.length })}
      </h3>

      <ol className="relative border-s border-border ms-4 space-y-4">
        {chain.map((amendment, index) => (
          <li key={amendment.id} className="ms-4" data-testid={`chain-entry-${index}`}>
            {/* Timeline dot */}
            <div className="absolute -start-1.5 w-3 h-3 rounded-full bg-primary border-2 border-white" />

            <div className="bg-muted border border-border rounded-md p-3 text-sm">
              {/* Version header */}
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-foreground">
                  {t('versionLabel', { version: index + 1 })}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    amendment.status === 'COMMITTED'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {amendment.status === 'COMMITTED' ? t('committed') : t('pendingAuthorization')}
                </span>
              </div>

              {/* Reason */}
              <div className="space-y-1 text-foreground">
                <div className="flex gap-2">
                  <span className="font-medium w-28 shrink-0">{t('reason')}</span>
                  <span>
                    {amendment.reasonCode
                      ? REASON_CODE_LABELS[amendment.reasonCode] ?? amendment.reasonCode
                      : '—'}
                  </span>
                </div>

                {amendment.reasonText && (
                  <div className="flex gap-2">
                    <span className="font-medium w-28 shrink-0">{t('explanation')}</span>
                    <span className="text-muted-foreground">{amendment.reasonText}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <span className="font-medium w-28 shrink-0">{t('initiatedBy')}</span>
                  <span className="font-mono text-xs text-muted-foreground">{amendment.initiatedBy}</span>
                </div>

                {amendment.authorizedBy && (
                  <div className="flex gap-2">
                    <span className="font-medium w-28 shrink-0">{t('authorizedBy')}</span>
                    <span className="font-mono text-xs text-muted-foreground">{amendment.authorizedBy}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <span className="font-medium w-28 shrink-0">{t('initiated')}</span>
                  <span className="text-muted-foreground">{formatTimestamp(amendment.initiatedAt)}</span>
                </div>

                {amendment.authorizedAt && (
                  <div className="flex gap-2">
                    <span className="font-medium w-28 shrink-0">{t('authorized')}</span>
                    <span className="text-muted-foreground">{formatTimestamp(amendment.authorizedAt)}</span>
                  </div>
                )}

                {/* Diff summary */}
                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t('diffSummaryTitle')}</p>
                  <div className="font-mono text-xs text-muted-foreground">
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
