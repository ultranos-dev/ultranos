'use client'

import { useState, useEffect, useCallback } from 'react'
import { db, type SyncQueueEntry } from '@/lib/db'
import { isTier1Resource, isConflictOverdue } from '@/lib/conflict-resolution'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { ConflictDiffView } from './ConflictDiffView'

const RESOURCE_LABELS: Record<string, string> = {
  AllergyIntolerance: 'Allergy',
  MedicationRequest: 'Medication',
  Condition: 'Diagnosis',
}

function safeResourceLabel(resourceType: string): string {
  return RESOURCE_LABELS[resourceType] ?? 'Record'
}

function formatConflictAge(createdAt: string): string {
  const ageMs = Date.now() - new Date(createdAt).getTime()
  const hours = Math.floor(ageMs / (60 * 60 * 1000))
  if (hours < 1) return 'Less than 1 hour'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h ago`
}

export function ConflictList() {
  const [conflicts, setConflicts] = useState<SyncQueueEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadConflicts = useCallback(async () => {
    try {
      const all = await db.syncQueue.toArray()

      const tier1 = all.filter(
        (entry) =>
          entry.conflictFlag === true &&
          entry.status !== 'resolved' &&
          isTier1Resource(entry.resourceType),
      )

      // Sort: overdue first, then by createdAt ascending (oldest first)
      tier1.sort((a, b) => {
        const aOverdue = isConflictOverdue(a.createdAt)
        const bOverdue = isConflictOverdue(b.createdAt)
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })

      setConflicts(tier1)
      setLoadError(false)
    } catch {
      setConflicts([])
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConflicts()
    const interval = setInterval(loadConflicts, 5_000)
    return () => clearInterval(interval)
  }, [loadConflicts])

  const handleExpand = useCallback((entryId: string) => {
    setExpandedId((prev) => (prev === entryId ? null : entryId))

    // Emit PHI READ audit outside state updater to avoid StrictMode double-fire
    // Read from current conflicts ref to avoid stale closure
    const entry = conflicts.find((c) => c.id === entryId)
    if (entry && expandedId !== entryId) {
      auditPhiAccess(
        AuditAction.READ,
        entry.resourceType as AuditResourceType,
        entry.resourceId,
        entry.patientRef?.replace('Patient/', ''),
        { phiAccess: 'conflict_review' },
      )
    }
  }, [conflicts, expandedId])

  const handleResolved = useCallback(() => {
    setExpandedId(null)
    loadConflicts()
  }, [loadConflicts])

  if (loading) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
        <p className="text-sm text-neutral-500">Loading conflicts...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-8 text-center" data-testid="conflict-load-error" role="alert">
        <p className="text-sm font-semibold text-red-800">Unable to load conflict data</p>
        <p className="mt-1 text-xs text-red-600">The conflict check could not read local data. This does not mean there are no conflicts.</p>
      </div>
    )
  }

  if (conflicts.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center" data-testid="no-conflicts">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="mx-auto h-12 w-12 text-green-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        <p className="mt-3 text-sm font-semibold text-neutral-700">No unresolved conflicts</p>
        <p className="mt-1 text-xs text-neutral-500">All Tier 1 safety-critical data is in sync.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="conflict-list">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-neutral-700">
          {conflicts.length} unresolved conflict{conflicts.length !== 1 ? 's' : ''}
        </p>
      </div>

      {conflicts.map((entry) => {
        const overdue = isConflictOverdue(entry.createdAt)
        const isExpanded = expandedId === entry.id
        const shortId = entry.resourceId.slice(0, 8)
        const patientShortId = entry.patientRef
          ? entry.patientRef.replace('Patient/', '').slice(0, 8)
          : 'Unknown'

        return (
          <div
            key={entry.id}
            className={`rounded-xl border bg-white shadow-sm transition-colors ${
              overdue
                ? 'border-red-300 bg-red-50'
                : 'border-neutral-200'
            }`}
            data-testid="conflict-item"
          >
            {/* Conflict summary row */}
            <button
              type="button"
              onClick={() => handleExpand(entry.id)}
              className="flex w-full items-center gap-3 ps-5 pe-5 py-4 text-start"
              aria-expanded={isExpanded}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-neutral-900">
                    {safeResourceLabel(entry.resourceType)}
                  </span>
                  <span className="text-xs text-neutral-400">ID {shortId}</span>
                  {overdue && (
                    <span
                      className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white"
                      data-testid="overdue-badge"
                    >
                      OVERDUE
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                  <span>Patient: {patientShortId}</span>
                  <span>{formatConflictAge(entry.createdAt)}</span>
                  <span>{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
              </div>

              {/* Chevron */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className={`h-5 w-5 shrink-0 text-neutral-400 transition-transform ${
                  isExpanded ? 'rotate-180' : ''
                }`}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {/* Expanded diff view */}
            {isExpanded && (
              <div className="border-t border-neutral-200 ps-5 pe-5 py-4">
                <ConflictDiffView entry={entry} onResolved={handleResolved} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
