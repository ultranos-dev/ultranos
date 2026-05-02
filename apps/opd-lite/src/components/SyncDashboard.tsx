'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSyncStore } from '@/stores/sync-store'
import { db, type SyncQueueEntry } from '@/lib/db'
import { triggerDrain } from '@/lib/sync-worker'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'

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
  if (raw.includes('conflict') || entry.conflictFlag) return 'Conflict detected'
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
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
        </svg>
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
    case 'in-flight':
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
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
          </svg>
          Failed
        </span>
      )
    default:
      return null
  }
}

// --- Resource type icon ---

function ResourceIcon({ resourceType }: { resourceType: string }) {
  const label = safeResourceLabel(resourceType)
  // Simple emoji-free icons by resource type
  const iconPaths: Record<string, string> = {
    Encounter: 'M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    Vitals: 'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z',
    Prescription: 'M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5',
  }
  const d = iconPaths[label] ?? 'M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z'

  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 shrink-0 text-neutral-400">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
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
    const totalPending = queueItems.filter(e => e.status === 'pending' || e.status === 'in-flight').length
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

  const handleSyncNow = useCallback(async () => {
    if (!navigator.onLine) return
    setIsDraining(true)
    try {
      await triggerDrain()
    } finally {
      setIsDraining(false)
      loadItems()
    }
  }, [setIsDraining, loadItems])

  if (!isDashboardOpen) return null

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
  const hasFailedItems = summary.totalFailed > 0 || summary.totalConflicts > 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16" data-testid="sync-dashboard">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm"
        onClick={() => setDashboardOpen(false)}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="relative mx-4 w-full max-w-lg overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl"
        role="dialog"
        aria-label="Sync Dashboard"
      >
        {/* Header */}
        <div className="border-b border-neutral-200 px-5 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-900">Sync Status</h2>
            <button
              type="button"
              onClick={() => setDashboardOpen(false)}
              className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
              aria-label="Close sync dashboard"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
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

          {/* Actions row */}
          <div className="mt-3 flex gap-2">
            {/* Sync Now (AC: 7) */}
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={!isOnline || isDraining}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              title={!isOnline ? 'No network connection' : undefined}
              data-testid="sync-now-btn"
            >
              {isDraining ? (
                <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-3.5 w-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                </svg>
              )}
              {isDraining ? 'Syncing...' : 'Sync Now'}
            </button>

            {/* Retry All Failed */}
            {hasFailedItems && (
              <button
                type="button"
                onClick={handleRetryAllFailed}
                className="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
                data-testid="retry-all-btn"
              >
                Retry All Failed
              </button>
            )}
          </div>
        </div>

        {/* Queue items grouped by resource type (AC: 2, 3) */}
        <div className="max-h-[60vh] overflow-y-auto" data-testid="sync-item-list">
          {queueItems.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-neutral-500">
              All synced — no pending items
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.resourceType} className="border-b border-neutral-100 last:border-b-0">
                {/* Group header */}
                <div className="flex items-center gap-2 bg-neutral-50 px-5 py-2">
                  <ResourceIcon resourceType={group.resourceType} />
                  <span className="text-xs font-semibold text-neutral-700">{group.label}</span>
                  <span className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-xs font-medium text-neutral-600">
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
                      <p className="text-sm text-neutral-800">{safeDescription(item)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <StatusBadge status={item.status} conflictFlag={item.conflictFlag} />
                        <span className="text-xs text-neutral-400">{formatTimeAgo(item.createdAt)}</span>
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
                        <button
                          type="button"
                          onClick={() => handleRetry(item.id)}
                          className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                          data-testid="retry-btn"
                        >
                          Retry
                        </button>
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
                              <button
                                type="button"
                                onClick={() => handleDiscard(item.id)}
                                className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                                data-testid="confirm-discard-btn"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setDiscardingId(null)}
                                className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDiscardingId(item.id)}
                              className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-200"
                              data-testid="discard-btn"
                            >
                              Discard
                            </button>
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
