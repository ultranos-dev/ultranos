'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useLocale } from 'next-intl'
import { formatDate } from '@ultranos/ui-kit'
import { AlertTriangle, CircleX, RefreshCw, X, User, HeartPulse, Pill, FileText, Stethoscope, ClipboardList, ShieldAlert, FlaskConical, ChevronDown } from '@ultranos/ui-kit/icons'
import { Button } from '@ultranos/ui-kit/components/ui/button'
import { useSyncStore } from '@/stores/sync-store'
import { db, type SyncQueueEntry } from '@/lib/db'
import { triggerDrain } from '@/lib/sync-worker'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
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

function formatTimeAgo(iso: string, locale: 'en' | 'ar' | 'prs' | 'ps'): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  return formatDate(d, locale)
}

// --- Status badge ---

function StatusBadge({ status, conflictFlag }: { status: string; conflictFlag?: boolean }) {
  if (conflictFlag) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning" data-testid="badge-conflict">
        <AlertTriangle className="h-3.5 w-3.5" />
        Conflict
      </span>
    )
  }

  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning" data-testid="badge-pending">
          <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
          Pending
        </span>
      )
    case 'syncing':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary" data-testid="badge-syncing">
          <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
          </svg>
          Syncing
        </span>
      )
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-medium text-destructive" data-testid="badge-failed">
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
  const locale = useLocale() as 'en' | 'ar' | 'prs' | 'ps'
  const { isDashboardOpen, setDashboardOpen, lastSyncedAt, isDraining, setIsDraining } = useSyncStore()
  const [queueItems, setQueueItems] = useState<SyncQueueEntry[]>([])
  const [discardingId, setDiscardingId] = useState<string | null>(null)
  const [phase, setPhase] = useState<'idle' | 'syncing' | 'complete' | 'error'>('idle')
  // Resource groups are collapsed by default; track which are expanded.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = useCallback((resourceType: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(resourceType)) next.delete(resourceType)
      else next.add(resourceType)
      return next
    })
  }, [])

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
    if (!navigator.onLine || isDraining) return
    setIsDraining(true)
    setPhase('syncing')
    try {
      // Phase 1: Push pending local changes to Hub
      await triggerDrain()

      // Phase 2: Pull remote changes for the active patient (if a chart is open)
      if (activePatientId) {
        const { getSupabaseBrowserClient } = await import('@/lib/supabase')
        const { data } = await getSupabaseBrowserClient().auth.getSession()
        const token = data.session?.access_token ?? ''
        if (token) {
          await pullPatientChanges(activePatientId, () => token)
        }
      }

      setPhase('complete')

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
      setPhase('error')
    } finally {
      // Brief delay so final phase is visible
      await new Promise(r => setTimeout(r, 600))
      setPhase('idle')
      setIsDraining(false)
      loadItems()
    }
  }, [setIsDraining, loadItems, activePatientId, isDraining])

  if (!isDashboardOpen) return null

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
  const hasMultipleFailed = summary.totalFailed >= 2 || summary.totalConflicts >= 2
  const phaseLabel =
    phase === 'syncing'
      ? 'Syncing changes to Hub...'
      : phase === 'complete'
        ? 'Sync complete'
        : phase === 'error'
          ? 'Sync failed — will retry'
          : null

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
        className="relative mx-4 w-full max-w-lg overflow-hidden rounded-xl bg-background ring-[0.65px] ring-border/50 shadow-2xl animate-[syncPanelIn_200ms_ease-out_forwards]"
        role="dialog"
        aria-label="Sync Dashboard"
      >
        {/* Header */}
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Sync Status</h2>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={() => setDashboardOpen(false)}
              aria-label="Close sync dashboard"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Summary (AC: 6) */}
          <div className="mt-3 flex flex-wrap gap-3 text-xs" data-testid="sync-summary">
            <span className="rounded-md bg-warning/10 px-2 py-1 font-medium text-warning">
              {summary.totalPending} pending
            </span>
            <span className="rounded-md bg-destructive/10 px-2 py-1 font-medium text-destructive">
              {summary.totalFailed} failed
            </span>
            <span className="rounded-md bg-warning/10 px-2 py-1 font-medium text-warning">
              {summary.totalConflicts} conflicts
            </span>
            {summary.lastSyncedAt && (
              <span className="rounded-md bg-success/10 px-2 py-1 text-success">
                Last sync: {formatTimeAgo(summary.lastSyncedAt, locale)}
              </span>
            )}
          </div>

          {/* Sync progress bar — visible only during active sync */}
          {phase !== 'idle' && phaseLabel && (
            <div className="mt-3" data-testid="sync-progress">
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

          {/* Actions row */}
          <div className="mt-3 flex gap-2">
            {/* Sync Now (AC: 7) */}
            <Button
              size="sm"
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
            {hasMultipleFailed && (
              <Button
                size="sm"
                variant="outline"
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
            <EmptyState title="All synced — no pending items" size="sm" />
          ) : (
            groups.map((group) => {
              const isExpanded = expandedGroups.has(group.resourceType)
              return (
              <div key={group.resourceType} className="border-b border-border last:border-b-0">
                {/* Group header — collapsible toggle, collapsed by default */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.resourceType)}
                  aria-expanded={isExpanded}
                  aria-controls={`sync-group-${group.resourceType}`}
                  className="flex w-full items-center gap-2 bg-muted/50 px-5 py-2 text-start transition-colors hover:bg-muted"
                  data-testid="sync-group-header"
                >
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                    aria-hidden="true"
                  />
                  <ResourceIcon resourceType={group.resourceType} />
                  <span className="text-xs font-semibold text-foreground">{group.label}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {group.items.length}
                  </span>
                </button>

                {/* Items — hidden while collapsed */}
                {isExpanded && (
                <div id={`sync-group-${group.resourceType}`}>
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 border-t border-border px-5 py-3"
                    data-testid="sync-item"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">{safeDescription(item)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <StatusBadge status={item.status} conflictFlag={item.conflictFlag} />
                        <span className="text-xs text-muted-foreground">{formatTimeAgo(item.createdAt, locale)}</span>
                      </div>
                      {/* Failure reason (AC: 4) */}
                      {item.status === 'failed' && (
                        <p className="mt-1 text-xs text-destructive" data-testid="failure-reason">
                          {safeFailureReason(item)}
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex shrink-0 gap-1">
                      {/* Retry (AC: 4) */}
                      {item.status === 'failed' && (
                        <Button
                          size="sm"
                          variant="outline"
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
                            className="rounded-md bg-warning/10 px-2 py-1 text-xs font-medium text-warning hover:bg-warning/20"
                            data-testid="resolve-conflict-link"
                          >
                            Resolve
                          </a>
                        ) : (
                          <span
                            className="rounded-md bg-warning/10 px-2 py-1 text-xs text-warning"
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
                                size="sm"
                                variant="destructive"
                                type="button"
                                onClick={() => handleDiscard(item.id)}
                                data-testid="confirm-discard-btn"
                              >
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                type="button"
                                onClick={() => setDiscardingId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
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
                )}
              </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}