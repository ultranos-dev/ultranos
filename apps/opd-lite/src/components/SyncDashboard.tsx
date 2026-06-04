'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { AlertTriangle, CircleX, RefreshCw, X, User, HeartPulse, Pill, FileText, Stethoscope, ClipboardList, ShieldAlert, FlaskConical } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import { useSyncStore } from '@/stores/sync-store'
import { db, type SyncQueueEntry } from '@/lib/db'
import { triggerDrain } from '@/lib/sync-worker'
import { pullPatientChanges } from '@/lib/sync-pull'
import { auditPhiAccess, AuditAction } from '@/lib/audit'
import type { AuditResourceType } from '@/lib/audit'

// --- PHI-safe resource labels (AC: 9) ---

const RESOURCE_LABELS: Record<string, string> = {
  Encounter: 'Encounter',
  ClinicalImpression: 'SOAP Note',
  Observation: 'Vitals',
  MedicationRequest: 'Prescription',
  AllergyIntolerance: 'Allergy',
  Condition: 'Diagnosis',
  Consent: 'Consent',
  DiagnosticReport: 'Lab Result',
  Patient: 'Demographics',
}

/** Route map for conflict resolution — each resource type links to its clinical view. */
const RESOURCE_ROUTES: Record<string, (resourceId: string) => string> = {
  Encounter: (id) => `/encounter/${id}`,
  ClinicalImpression: (id) => `/encounter/${id}`,
  Observation: (id) => `/encounter/${id}`,
  MedicationRequest: (id) => `/encounter/${id}`,
  AllergyIntolerance: (id) => `/encounter/${id}`,
  Condition: (id) => `/encounter/${id}`,
  Consent: (id) => `/consent/${id}`,
  DiagnosticReport: (id) => `/lab/${id}`,
  Patient: (id) => `/patient/${id}`,
}

function getConflictRoute(entry: SyncQueueEntry): string | null {
  const routeFn = RESOURCE_ROUTES[entry.resourceType]
  if (!routeFn) return null
  const id = entry.resourceId.split('/').pop() ?? entry.resourceId
  return routeFn(id)
}

function safeResourceLabel(resourceType: string): string {
  return RESOURCE_LABELS[resourceType] ?? 'Record'
}

/** Format patient reference as "Patient [short ID]" — never show real name (AC: 9). */
function safeDescription(entry: SyncQueueEntry): string {
  const label = safeResourceLabel(entry.resourceType)
  const shortId = entry.resourceId.slice(0, 8)
  return `${label} — ID ${shortId}`
}

/** Generic failure reason — never expose server internals or PHI (AC: 9). */
function safeFailureReason(entry: SyncQueueEntry): string {
  const raw = entry.failureReason ?? ''
  if (raw.includes('HTTP 4')) return 'Server rejected'
  if (raw.includes('HTTP 5')) return 'Server error'
  if (raw.toLowerCase().includes('conflict') || entry.conflictFlag) return 'Conflict detected'
  if (raw.includes('network') || raw.includes('fetch')) return 'Network error'
  if (raw) return 'Sync failed'
  return 'Unknown error'
}

function formatTimeAgo(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  return d.toLocaleDateString()
}

// --- Status badge ---

function StatusBadge({ status, conflictFlag }: { status: string; conflictFlag?: boolean }) {
  if (conflictFlag) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" data-testid="badge-conflict">
        <AlertTriangle className="h-3.5 w-3.5" />
        Conflict
      </span>
    )
  }

  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800" data-testid="badge-pending">
          <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
          Pending
        </span>
      )
    case 'syncing':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800" data-testid="badge-syncing">
          <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
          </svg>
          Syncing
        </span>
      )
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800" data-testid="badge-failed">
          <CircleX className="h-3.5 w-3.5" />
          Failed
        </span>
      )
    default:
      return null
  }
}

// --- Resource type icon ---

const RESOURCE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Encounter: Stethoscope,
  'SOAP Note': ClipboardList,
  Vitals: HeartPulse,
  Prescription: Pill,
  Allergy: ShieldAlert,
  Diagnosis: FileText,
  Consent: FileText,
  'Lab Result': FlaskConical,
  Demographics: User,
}

function ResourceIcon({ resourceType }: { resourceType: string }) {
  const label = safeResourceLabel(resourceType)
  const Icon = RESOURCE_ICON_MAP[label] ?? FileText
  return <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
}

// --- Grouped items ---

interface ResourceGroup {
  resourceType: string
  label: string
  items: SyncQueueEntry[]
}

function groupByResourceType(entries: SyncQueueEntry[]): ResourceGroup[] {
  const map = new Map<string, SyncQueueEntry[]>()
  for (const e of entries) {
    const existing = map.get(e.resourceType)
    if (existing) {
      existing.push(e)
    } else {
      map.set(e.resourceType, [e])
    }
  }
  return Array.from(map.entries()).map(([resourceType, items]) => ({
    resourceType,
    label: safeResourceLabel(resourceType),
    items,
  }))
}

// --- Main Component ---

export function SyncDashboard() {
  const { isDashboardOpen, setDashboardOpen, lastSyncedAt, isDraining, setIsDraining } = useSyncStore()
  const [queueItems, setQueueItems] = useState<SyncQueueEntry[]>([])
  const [discardingId, setDiscardingId] = useState<string | null>(null)
  const [syncPhase, setSyncPhase] = useState<string | null>(null)

  // Load queue items from Dexie and subscribe to changes
  const loadItems = useCallback(async () => {
    const all = await db.syncQueue.toArray()
    setQueueItems(all)
  }, [])

  useEffect(() => {
    if (!isDashboardOpen) {
      setDiscardingId(null)
      return
    }
    loadItems()
    // Poll every 2 seconds for real-time updates while open (AC: 8)
    const interval = setInterval(loadItems, 2_000)
    return () => clearInterval(interval)
  }, [isDashboardOpen, loadItems])

  // Derived counts
  const summary = useMemo(() => {
    const totalPending = queueItems.filter(e => e.status === 'pending' || e.status === 'syncing').length
    const totalFailed = queueItems.filter(e => e.status === 'failed' && !e.conflictFlag).length
    const totalConflicts = queueItems.filter(e => e.conflictFlag).length
    return { totalPending, totalFailed, totalConflicts, lastSyncedAt }
  }, [queueItems, lastSyncedAt])

  // Update conflict count in store
  useEffect(() => {
    useSyncStore.getState().setConflictCount(summary.totalConflicts)
  }, [summary.totalConflicts])

  const groups = useMemo(() => groupByResourceType(queueItems), [queueItems])

  // --- Actions ---

  const handleRetry = useCallback(async (id: string) => {
    await db.syncQueue.update(id, { status: 'pending', retryCount: 0, failureReason: undefined, conflictFlag: undefined })
    loadItems()
    triggerDrain()
  }, [loadItems])

  const handleRetryAllFailed = useCallback(async () => {
    const failed = queueItems.filter(e => e.status === 'failed' && !e.conflictFlag)
    await Promise.all(
      failed.map(e => db.syncQueue.update(e.id, { status: 'pending', retryCount: 0, failureReason: undefined }))
    )
    loadItems()
    triggerDrain()
  }, [queueItems, loadItems])

  const handleDiscard = useCallback(async (id: string) => {
    const entry = await db.syncQueue.get(id)
    if (entry) {
      auditPhiAccess(
        AuditAction.DELETE_REQUEST,
        entry.resourceType as AuditResourceType,
        entry.resourceId,
        undefined,
        { reason: 'user_discard_from_sync_dashboard' },
      )
    }
    await db.syncQueue.delete(id)
    setDiscardingId(null)
    loadItems()
  }, [loadItems])

  const activePatientId = useSyncStore((s) => s.activePatientId)

  const handleSyncNow = useCallback(async () => {
    if (!navigator.onLine) {
      return
    }
    setIsDraining(true)
    try {
      // Phase 1: Push pending local changes to Hub
      const pendingCount = queueItems.filter(e => e.status === 'pending' || e.status === 'syncing').length
      setSyncPhase(pendingCount > 0 ? `Pushing ${pendingCount} pending change${pendingCount !== 1 ? 's' : ''} to Hub...` : 'Checking for pending changes...')
      await triggerDrain()

      // Phase 2: Pull remote changes for the active patient (if a chart is open)
      if (activePatientId) {
        setSyncPhase('Pulling latest patient data from Hub...')
        const { getSupabaseBrowserClient } = await import('@/lib/supabase')
        const { data } = await getSupabaseBrowserClient().auth.getSession()
        const token = data.session?.access_token ?? ''
        if (token) {
          await pullPatientChanges(activePatientId, () => token)
        }
      }

      setSyncPhase('Sync complete')

      // Always update lastSyncedAt — even if nothing was pushed/pulled,
      // a successful sync check should clear the "never synced" state
      const state = useSyncStore.getState()
      state.updateSyncStatus({
        isPending: state.isPending,
        isError: state.isError,
        lastSyncedAt: new Date().toISOString(),
        pendingCount: state.pendingCount,
        failedCount: state.failedCount,
      })
    } catch (err) {
      console.error('[SyncDashboard] Sync failed — see audit log for details')
      setSyncPhase('Sync failed — will retry')
    } finally {
      // Brief delay so final phase is visible
      await new Promise(r => setTimeout(r, 600))
      setSyncPhase(null)
      setIsDraining(false)
      loadItems()
    }
  }, [setIsDraining, loadItems, activePatientId, queueItems, isDraining])

  if (!isDashboardOpen) return null

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
  const hasFailedItems = summary.totalFailed > 0 || summary.totalConflicts > 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16" data-testid="sync-dashboard">
      <style>{`
        @keyframes syncBackdropIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes syncPanelIn {
          from { opacity: 0; transform: scale(0.97) translateY(-4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes syncProgress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/40 backdrop-blur-sm animate-[syncBackdropIn_100ms_ease-out_forwards]"
        onClick={() => setDashboardOpen(false)}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="relative mx-4 w-full max-w-lg overflow-hidden rounded-xl bg-background ring-[0.65px] ring-gray-400/40 shadow-2xl animate-[syncPanelIn_200ms_ease-out_forwards]"
        role="dialog"
        aria-label="Sync Dashboard"
      >
        {/* Header */}
        <div className="border-b border-neutral-200 px-5 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Sync Status</h2>
            <Button
              variant="icon"
              type="button"
              onClick={() => setDashboardOpen(false)}
              aria-label="Close sync dashboard"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Summary (AC: 6) */}
          <div className="mt-3 flex flex-wrap gap-3 text-xs" data-testid="sync-summary">
            <span className="rounded-md bg-yellow-50 px-2 py-1 font-medium text-yellow-700">
              {summary.totalPending} pending
            </span>
            <span className="rounded-md bg-red-50 px-2 py-1 font-medium text-red-700">
              {summary.totalFailed} failed
            </span>
            <span className="rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-700">
              {summary.totalConflicts} conflicts
            </span>
            {summary.lastSyncedAt && (
              <span className="rounded-md bg-green-50 px-2 py-1 text-green-700">
                Last sync: {formatTimeAgo(summary.lastSyncedAt)}
              </span>
            )}
          </div>

          {/* Sync progress bar — visible only during active sync */}
          {isDraining && syncPhase && (
            <div className="mt-3" data-testid="sync-progress">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    syncPhase === 'Sync complete' ? 'w-full bg-green-500' : 'bg-blue-500 animate-[syncProgress_1.5s_ease-in-out_infinite]'
                  }`}
                  style={syncPhase !== 'Sync complete' ? { width: '70%' } : undefined}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{syncPhase}</p>
            </div>
          )}

          {/* Actions row */}
          <div className="mt-3 flex gap-2">
            {/* Sync Now (AC: 7) */}
            <Button
              variant="primary"
              className="gap-1.5"
              type="button"
              onClick={handleSyncNow}
              disabled={!isOnline || isDraining}
              title={!isOnline ? 'No network connection' : undefined}
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
              {isDraining ? 'Syncing...' : 'Sync Now'}
            </Button>

            {/* Retry All Failed */}
            {hasFailedItems && (
              <Button
                variant="secondary"
                className="gap-1.5"
                type="button"
                onClick={handleRetryAllFailed}
                data-testid="retry-all-btn"
              >
                Retry All Failed
              </Button>
            )}
          </div>
        </div>

        {/* Queue items grouped by resource type (AC: 2, 3) */}
        <div className="max-h-[60vh] overflow-y-auto" data-testid="sync-item-list">
          {queueItems.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              All synced — no pending items
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.resourceType} className="border-b border-neutral-100 last:border-b-0">
                {/* Group header */}
                <div className="flex items-center gap-2 bg-muted px-5 py-2">
                  <ResourceIcon resourceType={group.resourceType} />
                  <span className="text-xs font-semibold text-foreground">{group.label}</span>
                  <span className="rounded-full bg-secondary px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {group.items.length}
                  </span>
                </div>

                {/* Items */}
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 border-t border-neutral-50 px-5 py-3"
                    data-testid="sync-item"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">{safeDescription(item)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <StatusBadge status={item.status} conflictFlag={item.conflictFlag} />
                        <span className="text-xs text-muted-foreground">{formatTimeAgo(item.createdAt)}</span>
                      </div>
                      {/* Failure reason (AC: 4) */}
                      {item.status === 'failed' && (
                        <p className="mt-1 text-xs text-red-600" data-testid="failure-reason">
                          {safeFailureReason(item)}
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex shrink-0 gap-1">
                      {/* Retry (AC: 4) */}
                      {item.status === 'failed' && (
                        <Button
                          variant="outline"
                          className="bg-blue-50 text-blue-700 hover:bg-blue-100"
                          type="button"
                          onClick={() => handleRetry(item.id)}
                          data-testid="retry-btn"
                        >
                          Retry
                        </Button>
                      )}

                      {/* Conflict link (AC: 5) */}
                      {item.conflictFlag && (() => {
                        const route = getConflictRoute(item)
                        return route ? (
                          <a
                            href={route}
                            className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                            data-testid="resolve-conflict-link"
                          >
                            Resolve
                          </a>
                        ) : (
                          <span
                            className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-600"
                            data-testid="resolve-conflict-link"
                          >
                            Resolve in clinical view
                          </span>
                        )
                      })()}

                      {/* Discard (AC: 4) */}
                      {item.status === 'failed' && (
                        <>
                          {discardingId === item.id ? (
                            <div className="flex gap-1">
                              <Button
                                variant="danger"
                                type="button"
                                onClick={() => handleDiscard(item.id)}
                                data-testid="confirm-discard-btn"
                              >
                                Confirm
                              </Button>
                              <Button
                                variant="secondary"
                                type="button"
                                onClick={() => setDiscardingId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="secondary"
                              type="button"
                              onClick={() => setDiscardingId(item.id)}
                              data-testid="discard-btn"
                            >
                              Discard
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
