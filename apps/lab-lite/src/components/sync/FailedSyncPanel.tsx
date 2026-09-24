'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { classifySyncFailure } from '@ultranos/sync-engine'
import { AlertTriangle, RefreshCw, ChevronDown } from '@ultranos/ui-kit/icons'
import { Button } from '@ultranos/ui-kit/components/ui/button'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import {
  getDb,
  getFailedOrderAcks,
  retryOrderAck,
  type UploadQueueEntry,
  type OrderAckQueueEntry,
} from '@/lib/db'
import { loadSyncQueueRecords, type SyncQueueDisplayEntry } from '@/components/SyncDashboard'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { drainResultSyncQueue } from '@/lib/result-sync'
import { drainSpecimenSyncQueue } from '@/lib/specimen-sync'
import { drainOrderAckQueue } from '@/lib/order-ack-sync'
import { triggerUploadDrain } from '@/lib/upload-drain-init'

/**
 * FailedSyncPanel — Story 60.4 (Task 1 / AC 1, 2).
 *
 * A persistent, PHI-safe visibility surface for every dead-lettered / failed
 * write-back edge the lab believed it had delivered:
 *   - failed structured records (Dexie syncQueue: DiagnosticReport / Specimen)
 *   - failed result-file uploads (Dexie uploadQueue)
 *   - dead-lettered order acknowledgements (Dexie orderAckQueue)
 *
 * Each row NAMES the failed item by a generic i18n label + a short OPAQUE
 * reference (last 8 chars of the record id) and offers Retry / Details. It never
 * renders payload contents, patient data, or raw server error text (Rule #1) —
 * the failure reason is always shown via the categorized `failure.*` catalog.
 */

/** Short opaque reference for display — last 8 chars of an id (never PHI). */
function shortRef(id: string): string {
  return id.length > 8 ? id.slice(-8) : id
}

async function getToken(): Promise<string> {
  const { data } = await getSupabaseBrowserClient().auth.getSession()
  return data.session?.access_token ?? ''
}

export interface FailedSyncPanelProps {
  /** When true, renders the compact worklist card (only when failures exist). */
  compact?: boolean
}

export function FailedSyncPanel({ compact = false }: FailedSyncPanelProps) {
  const t = useTranslations('failedSync')
  const tf = useTranslations('syncDashboard.failure')

  const [records, setRecords] = useState<SyncQueueDisplayEntry[]>([])
  const [uploads, setUploads] = useState<UploadQueueEntry[]>([])
  const [orderAcks, setOrderAcks] = useState<OrderAckQueueEntry[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const db = getDb()
    const [syncRecs, uploadRows, ackRows] = await Promise.all([
      loadSyncQueueRecords(),
      db.uploadQueue.where('status').equals('failed').toArray(),
      getFailedOrderAcks(),
    ])
    setRecords(syncRecs.filter((r) => r.status === 'failed'))
    setUploads(uploadRows)
    setOrderAcks(ackRows)
  }, [])

  useEffect(() => {
    void load()
    const interval = setInterval(() => void load(), 5_000)
    return () => clearInterval(interval)
  }, [load])

  const totalFailed = records.length + uploads.length + orderAcks.length

  const triggerAllDrains = useCallback(async () => {
    triggerUploadDrain()
    await Promise.all([
      drainResultSyncQueue(getToken),
      drainSpecimenSyncQueue(getToken),
      drainOrderAckQueue(getToken),
    ])
    void load()
  }, [load])

  const handleRetryRecord = useCallback(
    async (record: SyncQueueDisplayEntry) => {
      const db = getDb()
      await db.syncQueue.update(record.id, { status: 'pending', failureReason: undefined, lastAttemptAt: null })
      void triggerAllDrains()
    },
    [triggerAllDrains],
  )

  const handleRetryUpload = useCallback(
    async (entry: UploadQueueEntry) => {
      if (entry.id === undefined) return
      const db = getDb()
      await db.uploadQueue.update(entry.id, { status: 'pending', lastAttemptAt: null })
      void triggerAllDrains()
    },
    [triggerAllDrains],
  )

  const handleRetryAck = useCallback(
    async (entry: OrderAckQueueEntry) => {
      await retryOrderAck(entry.orderId)
      void triggerAllDrains()
    },
    [triggerAllDrains],
  )

  const handleRetryAll = useCallback(async () => {
    const db = getDb()
    await Promise.all([
      ...records.map((r) => db.syncQueue.update(r.id, { status: 'pending', failureReason: undefined, lastAttemptAt: null })),
      ...uploads.map((e) => (e.id !== undefined ? db.uploadQueue.update(e.id, { status: 'pending', lastAttemptAt: null }) : Promise.resolve())),
      ...orderAcks.map((a) => retryOrderAck(a.orderId)),
    ])
    void triggerAllDrains()
  }, [records, uploads, orderAcks, triggerAllDrains])

  const badgeLabel = useMemo(
    () => (totalFailed === 1 ? t('badge', { count: totalFailed }) : t('badgePlural', { count: totalFailed })),
    [totalFailed, t],
  )

  // Compact worklist card: render nothing unless there ARE failures.
  if (compact && totalFailed === 0) return null

  if (compact) {
    return (
      <div
        className="flex items-center justify-between gap-3 rounded-2xl bg-destructive/10 px-4 py-2 text-sm text-destructive"
        data-testid="failed-sync-badge"
        role="status"
      >
        <span className="flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {badgeLabel}
        </span>
        <Button size="sm" variant="outline" type="button" onClick={handleRetryAll} data-testid="failed-sync-badge-retry">
          <RefreshCw className="me-1 h-3.5 w-3.5" />
          {t('retryAll')}
        </Button>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50" data-testid="failed-sync-panel">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
          {t('title')}
        </h2>
        {totalFailed > 0 && (
          <Button size="sm" variant="outline" type="button" onClick={handleRetryAll} data-testid="failed-sync-retry-all">
            <RefreshCw className="me-1 h-3.5 w-3.5" />
            {t('retryAll')}
          </Button>
        )}
      </div>

      {totalFailed === 0 ? (
        <div className="flex min-h-[10rem] items-center justify-center">
          <EmptyState size="sm" icon={RefreshCw} title={t('empty')} />
        </div>
      ) : (
        <div className="divide-y divide-border">
          {/* Structured records (DiagnosticReport / Specimen) */}
          {records.map((r) => {
            const label = r.resourceType === 'DiagnosticReport' ? t('resultLabel') : t('specimenLabel')
            const rowId = `rec-${r.id}`
            return (
              <div key={rowId} className="flex items-start gap-3 px-5 py-3" data-testid="failed-sync-record">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">
                    {label} · {t('reference', { ref: shortRef(r.id) })}
                  </p>
                  <p className="mt-1 text-xs text-destructive" data-testid="failed-sync-reason">
                    {t('deadLettered')} — {tf(r.failureReason ?? 'unknown')}
                  </p>
                  {r.retryCount > 0 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{t('retryCount', { count: r.retryCount })}</p>
                  )}
                </div>
                <Button size="sm" variant="outline" type="button" onClick={() => handleRetryRecord(r)} data-testid="failed-sync-record-retry">
                  {t('retry')}
                </Button>
              </div>
            )
          })}

          {/* Dead-lettered order acknowledgements */}
          {orderAcks.map((a) => (
            <div key={`ack-${a.orderId}`} className="flex items-start gap-3 px-5 py-3" data-testid="failed-sync-ack">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">
                  {t('orderAckLabel')} · {t('reference', { ref: shortRef(a.orderId) })}
                </p>
                <p className="mt-1 text-xs text-destructive">
                  {t('deadLettered')} — {tf(a.failureReason ?? 'unknown')}
                </p>
                {a.retryCount > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('retryCount', { count: a.retryCount })}</p>
                )}
              </div>
              <Button size="sm" variant="outline" type="button" onClick={() => handleRetryAck(a)} data-testid="failed-sync-ack-retry">
                {t('retry')}
              </Button>
            </div>
          ))}

          {/* Failed result-file uploads */}
          {uploads.map((e) => {
            const rowId = `up-${e.id}`
            const isExpanded = expandedId === rowId
            return (
              <div key={rowId} className="flex items-start gap-3 px-5 py-3" data-testid="failed-sync-upload">
                <div className="min-w-0 flex-1">
                  {/* LOINC display + first name only (data-min compliant: lab sees name + age). */}
                  <p className="text-sm text-foreground">
                    {t('fileLabel')} · {e.metadata.loincDisplay} — {e.patientFirstName}
                  </p>
                  <p className="mt-1 text-xs text-destructive">
                    {tf(classifySyncFailure(e.failureReason))}
                  </p>
                  {isExpanded && e.retryCount > 0 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{t('retryCount', { count: e.retryCount })}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setExpandedId(isExpanded ? null : rowId)}
                    aria-label={isExpanded ? t('hideDetails') : t('details')}
                    data-testid="failed-sync-upload-details"
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  <Button size="sm" variant="outline" type="button" onClick={() => handleRetryUpload(e)} data-testid="failed-sync-upload-retry">
                    {t('retry')}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
