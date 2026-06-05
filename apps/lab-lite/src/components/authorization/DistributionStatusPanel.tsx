'use client'

/**
 * Story 42.6 — Distribution Status Panel
 * Task 6: Shows per-destination distribution status for a released result.
 *
 * Rendered inside ResultReviewPanel when authorizationStatus === APPROVED.
 * Polls every 5s while any destination is pending or delivering.
 *
 * PHI Safety: only reportId (opaque UUID) is used for queries. No result
 * values or patient data are displayed in this component.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { RefreshCw } from '@ultranos/ui-kit/icons'
import { getDistributionStatusForReport, updateDistributionQueueEntry } from '@/lib/db'
import type { DistributionQueueEntry, DistributionDestination } from '@/lib/db'

interface DistributionStatusPanelProps {
  reportId: string
}

const DESTINATION_LABELS: Record<DistributionDestination, string> = {
  OPD_LITE: 'OPD-Lite (Physician View)',
  PATIENT_LITE: 'Patient Health Passport',
  LOGBOOK: 'Digital Lab Logbook',
  STATS: 'Monthly Statistics',
}

const POLL_INTERVAL_MS = 5_000

type StatusBadgeVariant = 'pending' | 'delivering' | 'delivered' | 'failed' | 'not-queued'

function StatusBadge({ variant }: { variant: StatusBadgeVariant }) {
  const labelMap: Record<StatusBadgeVariant, string> = {
    pending: 'Pending',
    delivering: 'Delivering…',
    delivered: 'Delivered',
    failed: 'Failed',
    'not-queued': 'Not queued',
  }

  const classMap: Record<StatusBadgeVariant, string> = {
    pending: 'bg-amber-100 text-amber-800 border border-amber-300',
    delivering: 'bg-blue-100 text-blue-800 border border-blue-300',
    delivered: 'bg-green-100 text-green-700 border border-green-300',
    failed: 'bg-red-100 text-red-700 border border-red-300',
    'not-queued': 'bg-muted text-muted-foreground border border-border',
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${classMap[variant]}`}>
      {labelMap[variant]}
    </span>
  )
}

export function DistributionStatusPanel({ reportId }: DistributionStatusPanelProps) {
  const t = useTranslations('authorization')
  const [entries, setEntries] = useState<DistributionQueueEntry[]>([])
  const [retrying, setRetrying] = useState<Set<number>>(new Set())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadEntries = useCallback(async () => {
    try {
      const data = await getDistributionStatusForReport(reportId)
      setEntries(data)
    } catch {
      // Non-fatal — status panel failure must not break the review panel
    }
  }, [reportId])

  // Start/stop polling based on whether any entry is still in-flight
  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  useEffect(() => {
    const hasPending = entries.some(
      (e) => e.status === 'pending' || e.status === 'delivering',
    )

    if (hasPending && !intervalRef.current) {
      intervalRef.current = setInterval(() => {
        void loadEntries()
      }, POLL_INTERVAL_MS)
    } else if (!hasPending && intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [entries, loadEntries])

  async function handleRetry(entryId: number) {
    setRetrying((prev) => new Set(prev).add(entryId))
    try {
      await updateDistributionQueueEntry(entryId, {
        status: 'pending',
        retryCount: 0,
        lastAttemptAt: null,
      })
      await loadEntries()
    } catch {
      // Non-fatal
    } finally {
      setRetrying((prev) => {
        const next = new Set(prev)
        next.delete(entryId)
        return next
      })
    }
  }

  const ALL_DESTINATIONS: DistributionDestination[] = ['OPD_LITE', 'PATIENT_LITE', 'LOGBOOK', 'STATS']

  const entryByDestination = new Map(entries.map((e) => [e.destination, e]))

  if (entries.length === 0) return null

  return (
    <section aria-label={t('distributionSection')}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {t('distributionSection')}
      </h3>
      <ul className="divide-y divide-border/50 rounded-lg border border-border overflow-hidden">
        {ALL_DESTINATIONS.map((dest) => {
          const entry = entryByDestination.get(dest)
          const variant: StatusBadgeVariant = entry ? (entry.status as StatusBadgeVariant) : 'not-queued'

          return (
            <li
              key={dest}
              className="flex items-center justify-between px-4 py-2.5 bg-card text-sm"
            >
              <span className="text-foreground">{DESTINATION_LABELS[dest]}</span>
              <div className="flex items-center gap-2">
                <StatusBadge variant={variant} />
                {entry && entry.status === 'failed' && (
                  <span className="text-xs text-muted-foreground">
                    {t('retryCount', { count: entry.retryCount })}
                  </span>
                )}
                {entry && entry.status === 'failed' && (
                  <button
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/30 disabled:opacity-40"
                    disabled={retrying.has(entry.id!)}
                    onClick={() => void handleRetry(entry.id!)}
                    aria-label={`Retry ${DESTINATION_LABELS[dest]}`}
                  >
                    <RefreshCw size={12} aria-hidden="true" />
                    {t('retryButton')}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
