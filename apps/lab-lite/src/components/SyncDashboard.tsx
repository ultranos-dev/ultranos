'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { classifySyncFailure } from '@ultranos/sync-engine'
import { X, RefreshCw, CircleX } from '@ultranos/ui-kit/icons'
import { Button } from '@ultranos/ui-kit/components/ui/button'
import { useSyncStore } from '@/stores/sync-store'
import { getDb, type UploadQueueEntry } from '@/lib/db'
import { triggerUploadDrain } from '@/lib/upload-drain-init'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { drainResultSyncQueue } from '@/lib/result-sync'
import { drainSpecimenSyncQueue } from '@/lib/specimen-sync'

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Minimal shape of a db.syncQueue row for display purposes.
 * IMPORTANT: payload is intentionally omitted — it contains PHI-adjacent FHIR
 * bundles. We only use the safe operational fields listed below.
 */
export interface SyncQueueDisplayEntry {
  id: string
  resourceType: 'Specimen' | 'DiagnosticReport'
  status: 'pending' | 'failed'
  createdAt: string
  retryCount: number
  failureReason?: string
}

/** The two resourceTypes that have active drain workers. */
const DRAINED_RESOURCE_TYPES = ['Specimen', 'DiagnosticReport'] as const

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeAgo(iso: string): string {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  return d.toLocaleDateString()
}

/**
 * Load failed/pending syncQueue rows for the two resourceTypes that have
 * active drainers. Excludes 'synced'/'syncing' (those are done or in-flight)
 * and any other resourceTypes (no drainer → would show as perpetual-pending noise).
 * Exported so this pure query logic can be unit-tested without rendering.
 */
export async function loadSyncQueueRecords(): Promise<SyncQueueDisplayEntry[]> {
  const db = getDb()
  const rows = await db.syncQueue
    .where('resourceType')
    .anyOf(DRAINED_RESOURCE_TYPES)
    .filter((e: { status: string }) => e.status === 'pending' || e.status === 'failed')
    .toArray()

  // Map to the minimal safe shape — DO NOT include payload
  return rows.map((r: {
    id: string
    resourceType: 'Specimen' | 'DiagnosticReport'
    status: 'pending' | 'failed'
    createdAt: string
    retryCount?: number
    failureReason?: string
  }) => ({
    id: r.id,
    resourceType: r.resourceType,
    status: r.status,
    createdAt: r.createdAt,
    retryCount: r.retryCount ?? 0,
    failureReason: r.failureReason,
  }))
}

// ── Status badge — shared between uploadQueue and syncQueue rows ─────────────

function StatusBadge({ status }: { status: UploadQueueEntry['status'] | 'pending' | 'failed' }) {
  const t = useTranslations('syncDashboard')
  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">
          <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
          {t('statusPending')}
        </span>
      )
    case 'uploading':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
          <svg className="h-3 w-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
          </svg>
          {t('statusUploading')}
        </span>
      )
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-medium text-destructive">
          <CircleX className="h-3.5 w-3.5" />
          {t('statusFailed')}
        </span>
      )
    case 'expired':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {t('statusExpired')}
        </span>
      )
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export function SyncDashboard() {
  const { isDashboardOpen, setDashboardOpen, lastSyncedAt } = useSyncStore()
  const t = useTranslations('syncDashboard')
  const tf = useTranslations('syncDashboard.failure')

  // uploadQueue entries (file uploads)
  const [entries, setEntries] = useState<UploadQueueEntry[]>([])
  const [discardingId, setDiscardingId] = useState<number | null>(null)

  // syncQueue entries (structured Specimen/DiagnosticReport records)
  const [syncRecords, setSyncRecords] = useState<SyncQueueDisplayEntry[]>([])
  const [discardingSyncId, setDiscardingSyncId] = useState<string | null>(null)

  const [isDraining, setIsDraining] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'syncing' | 'complete' | 'error'>('idle')

  const loadEntries = useCallback(async () => {
    const db = getDb()
    const all = await db.uploadQueue.orderBy('queuedAt').reverse().toArray()
    setEntries(all)
    const records = await loadSyncQueueRecords()
    setSyncRecords(records)
  }, [])

  useEffect(() => {
    if (!isDashboardOpen) {
      setDiscardingId(null)
      setDiscardingSyncId(null)
      return
    }
    void loadEntries()
    const interval = setInterval(() => void loadEntries(), 2_000)
    return () => clearInterval(interval)
  }, [isDashboardOpen, loadEntries])

  const summary = useMemo(() => {
    const uploadPending = entries.filter((e) => e.status === 'pending' || e.status === 'uploading').length
    const uploadFailed = entries.filter((e) => e.status === 'failed').length
    const totalExpired = entries.filter((e) => e.status === 'expired').length
    const syncPending = syncRecords.filter((r) => r.status === 'pending').length
    const syncFailed = syncRecords.filter((r) => r.status === 'failed').length
    return {
      totalPending: uploadPending + syncPending,
      totalFailed: uploadFailed + syncFailed,
      totalExpired,
    }
  }, [entries, syncRecords])

  // ── uploadQueue handlers ──────────────────────────────────────────────────

  const handleRetry = useCallback(
    async (entry: UploadQueueEntry) => {
      if (entry.id === undefined) return
      const db = getDb()
      const current = await db.uploadQueue.get(entry.id)
      if (!current || current.status !== 'failed') return
      await db.uploadQueue.update(entry.id, { status: 'pending', lastAttemptAt: null })
      void loadEntries()
      triggerUploadDrain()
    },
    [loadEntries],
  )

  const handleRetryAllFailed = useCallback(async () => {
    const db = getDb()
    const failedUploads = entries.filter((e) => e.status === 'failed' && e.id !== undefined)
    await Promise.all(
      failedUploads.map((e) => db.uploadQueue.update(e.id!, { status: 'pending', lastAttemptAt: null })),
    )

    // Also retry all failed syncQueue records
    const failedRecords = syncRecords.filter((r) => r.status === 'failed')
    await Promise.all(
      failedRecords.map((r) =>
        db.syncQueue.update(r.id, { status: 'pending', failureReason: undefined, lastAttemptAt: null }),
      ),
    )

    void loadEntries()
    triggerUploadDrain()
    void triggerSyncQueueDrains()
  }, [entries, syncRecords, loadEntries])

  const handleDiscard = useCallback(
    async (id: number) => {
      const db = getDb()
      await db.uploadQueue.delete(id)
      setDiscardingId(null)
      void loadEntries()
    },
    [loadEntries],
  )

  // ── syncQueue handlers ────────────────────────────────────────────────────

  /**
   * Build a getToken function from the Supabase browser client and trigger
   * both drain workers. Called after resetting a syncQueue entry to 'pending'.
   */
  const triggerSyncQueueDrains = useCallback(async () => {
    const getToken = async (): Promise<string> => {
      const { data } = await getSupabaseBrowserClient().auth.getSession()
      return data.session?.access_token ?? ''
    }
    await Promise.all([drainResultSyncQueue(getToken), drainSpecimenSyncQueue(getToken)])
    void loadEntries()
  }, [loadEntries])

  const handleRetrySyncRecord = useCallback(
    async (record: SyncQueueDisplayEntry) => {
      const db = getDb()
      await db.syncQueue.update(record.id, {
        status: 'pending',
        failureReason: undefined,
        lastAttemptAt: null,
      })
      void loadEntries()
      void triggerSyncQueueDrains()
    },
    [loadEntries, triggerSyncQueueDrains],
  )

  const handleDiscardSyncRecord = useCallback(
    async (id: string) => {
      const db = getDb()
      await db.syncQueue.delete(id)
      setDiscardingSyncId(null)
      void loadEntries()
    },
    [loadEntries],
  )

  // ── Sync Now ──────────────────────────────────────────────────────────────

  const handleSyncNow = useCallback(async () => {
    if (!navigator.onLine || isDraining) return
    setIsDraining(true)
    setPhase('syncing')
    try {
      triggerUploadDrain()
      void triggerSyncQueueDrains()
      await new Promise((r) => setTimeout(r, 800))
      setPhase('complete')
      const state = useSyncStore.getState()
      state.updateSyncStatus({
        isPending: state.isPending,
        isError: state.isError,
        lastSyncedAt: new Date().toISOString(),
        pendingCount: state.pendingCount,
        failedCount: state.failedCount,
      })
    } catch {
      setPhase('error')
    } finally {
      await new Promise((r) => setTimeout(r, 600))
      setPhase('idle')
      setIsDraining(false)
      void loadEntries()
    }
  }, [isDraining, loadEntries, triggerSyncQueueDrains])

  // ── Resource type label (PHI-safe: never show payload content) ────────────

  const getResourceTypeLabel = useCallback(
    (resourceType: 'Specimen' | 'DiagnosticReport'): string => {
      if (resourceType === 'Specimen') return t('resourceTypeSpecimen')
      return t('resourceTypeDiagnosticReport')
    },
    [t],
  )

  if (!isDashboardOpen) return null

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
  const activeEntries = entries.filter((e) => e.status !== 'expired')
  const phaseLabel =
    phase === 'syncing'
      ? t('syncingPhase')
      : phase === 'complete'
        ? t('syncComplete')
        : phase === 'error'
          ? t('syncFailedRetry')
          : null

  const hasAnySyncFailed = syncRecords.some((r) => r.status === 'failed')
  const hasAnyUploadFailed = entries.some((e) => e.status === 'failed')

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16" data-testid="sync-dashboard">
      <style>{`
        @keyframes syncBackdropIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes syncPanelIn { from { opacity: 0; transform: scale(0.97) translateY(-4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes syncProgress { 0% { transform: translateX(-100%); } 50% { transform: translateX(0%); } 100% { transform: translateX(100%); } }
      `}</style>

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/40 backdrop-blur-sm animate-[syncBackdropIn_100ms_ease-out_forwards]"
        onClick={() => setDashboardOpen(false)}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="relative mx-4 w-full max-w-lg overflow-hidden rounded-xl bg-background ring-[0.65px] ring-border/50 shadow-2xl animate-[syncPanelIn_200ms_ease-out_forwards]"
        role="dialog"
        aria-label={t('ariaLabel')}
      >
        {/* Header */}
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">{t('title')}</h2>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={() => setDashboardOpen(false)}
              aria-label={t('closeAriaLabel')}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Summary */}
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <span className="rounded-md bg-warning/10 px-2 py-1 font-medium text-warning">
              {summary.totalPending} {t('pending')}
            </span>
            <span className="rounded-md bg-destructive/10 px-2 py-1 font-medium text-destructive">
              {summary.totalFailed} {t('failed')}
            </span>
            {summary.totalExpired > 0 && (
              <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
                {summary.totalExpired} {t('expired')}
              </span>
            )}
            {lastSyncedAt && (
              <span className="rounded-md bg-success/10 px-2 py-1 text-success">
                {t('lastSync', { time: formatTimeAgo(lastSyncedAt) })}
              </span>
            )}
          </div>

          {/* Sync progress */}
          {phase !== 'idle' && phaseLabel && (
            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    phase === 'complete' ? 'w-full bg-success' : 'bg-primary animate-[syncProgress_1.5s_ease-in-out_infinite]'
                  }`}
                  style={phase !== 'complete' ? { width: '70%' } : undefined}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground" aria-live="polite">{phaseLabel}</p>
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              className="gap-1.5"
              type="button"
              onClick={handleSyncNow}
              disabled={!isOnline || isDraining}
              title={!isOnline ? t('noNetworkConnection') : undefined}
              data-testid="sync-now-btn"
            >
              {isDraining ? (
                <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                </svg>
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {isDraining ? t('syncing') : t('syncNow')}
            </Button>
            {(summary.totalFailed >= 2 || (hasAnyUploadFailed && hasAnySyncFailed)) && (
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={handleRetryAllFailed}
                data-testid="retry-all-btn"
              >
                {t('retryAllFailed')}
              </Button>
            )}
          </div>
        </div>

        {/* Queue items */}
        <div className="max-h-[60vh] overflow-y-auto" data-testid="sync-item-list">
          {activeEntries.length === 0 && syncRecords.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              {t('allSynced')}
            </div>
          ) : (
            <>
              {/* ── Records section (syncQueue: Specimen + DiagnosticReport) ── */}
              {syncRecords.length > 0 && (
                <div>
                  <div className="border-b border-border bg-muted/30 px-5 py-1.5">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('recordsSectionLabel')}
                    </span>
                  </div>
                  {syncRecords.map((record) => (
                    <div
                      key={`sync-${record.id}`}
                      className="flex items-start gap-3 border-b border-border px-5 py-3 last:border-b-0"
                      data-testid="sync-record-item"
                    >
                      <div className="min-w-0 flex-1">
                        {/*
                         * PHI-safe: show only a generic i18n label derived from resourceType.
                         * NEVER render payload contents, resourceId, or any patient data.
                         */}
                        <p className="text-sm text-foreground" data-testid="sync-record-label">
                          {getResourceTypeLabel(record.resourceType)}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <StatusBadge status={record.status} />
                          <span className="text-xs text-muted-foreground">{formatTimeAgo(record.createdAt)}</span>
                          {record.retryCount > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {record.retryCount} retr{record.retryCount === 1 ? 'y' : 'ies'}
                            </span>
                          )}
                        </div>
                        {record.status === 'failed' && (
                          <p className="mt-1 text-xs text-destructive" data-testid="sync-record-failure-reason">
                            {tf(classifySyncFailure(record.failureReason))}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {record.status === 'failed' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              type="button"
                              onClick={() => handleRetrySyncRecord(record)}
                              data-testid="sync-record-retry-btn"
                            >
                              {t('retry')}
                            </Button>
                            {discardingSyncId === record.id ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  type="button"
                                  onClick={() => handleDiscardSyncRecord(record.id)}
                                  data-testid="sync-record-confirm-discard-btn"
                                >
                                  {t('confirm')}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                  onClick={() => setDiscardingSyncId(null)}
                                >
                                  {t('cancel')}
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                type="button"
                                onClick={() => setDiscardingSyncId(record.id)}
                                data-testid="sync-record-discard-btn"
                              >
                                {t('discard')}
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Files section (uploadQueue: file blobs) ── */}
              {activeEntries.length > 0 && (
                <div>
                  {syncRecords.length > 0 && (
                    <div className="border-b border-border bg-muted/30 px-5 py-1.5">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t('filesSectionLabel')}
                      </span>
                    </div>
                  )}
                  {activeEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 border-b border-border px-5 py-3 last:border-b-0"
                      data-testid="sync-item"
                    >
                      <div className="min-w-0 flex-1">
                        {/* Show LOINC display + patient first name — data minimization compliant (lab sees name + age only) */}
                        <p className="text-sm text-foreground">
                          {entry.metadata.loincDisplay} — {entry.patientFirstName}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <StatusBadge status={entry.status} />
                          <span className="text-xs text-muted-foreground">{formatTimeAgo(entry.queuedAt)}</span>
                          {entry.retryCount > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {entry.retryCount} retr{entry.retryCount === 1 ? 'y' : 'ies'}
                            </span>
                          )}
                        </div>
                        {/* Categorized failure reason — never the raw server text (PHI-safe). */}
                        {entry.status === 'failed' && (
                          <p className="mt-1 text-xs text-destructive" data-testid="failure-reason">
                            {tf(classifySyncFailure(entry.failureReason))}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {entry.status === 'failed' && entry.id !== undefined && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              type="button"
                              onClick={() => handleRetry(entry)}
                              data-testid="retry-btn"
                            >
                              {t('retry')}
                            </Button>
                            {discardingId === entry.id ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  type="button"
                                  onClick={() => handleDiscard(entry.id!)}
                                  data-testid="confirm-discard-btn"
                                >
                                  {t('confirm')}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                  onClick={() => setDiscardingId(null)}
                                >
                                  {t('cancel')}
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                type="button"
                                onClick={() => setDiscardingId(entry.id!)}
                                data-testid="discard-btn"
                              >
                                {t('discard')}
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
