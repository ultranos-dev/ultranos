'use client'

import { useState, useMemo, useCallback } from 'react'
import type { SyncQueueEntry } from '@/lib/db'
import {
  resolveConflict,
  isTier1Resource,
  type ResolutionType,
} from '@/lib/conflict-resolution'
import { useAuthSessionStore } from '@/stores/auth-session-store'

/** Fields to display for each resource type — never show raw IDs or internal fields. */
const DISPLAY_FIELDS: Record<string, string[]> = {
  AllergyIntolerance: [
    'clinicalStatus',
    'verificationStatus',
    'type',
    'category',
    'criticality',
    'code',
    'reaction',
    'onsetDateTime',
    'note',
  ],
  MedicationRequest: [
    'status',
    'intent',
    'medicationCodeableConcept',
    'dosageInstruction',
    'dispenseRequest',
    'note',
  ],
  Condition: [
    'clinicalStatus',
    'verificationStatus',
    'severity',
    'code',
    'bodySite',
    'onsetDateTime',
    'note',
  ],
}

function getDisplayFields(resourceType: string): string[] {
  return DISPLAY_FIELDS[resourceType] ?? ['code', 'status', 'note']
}

/** Format a field value for display — never expose raw PHI strings in dev console. */
function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '(empty)'
    // For FHIR coding arrays, show display text
    return value
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>
          return obj.display ?? obj.text ?? obj.code ?? JSON.stringify(obj)
        }
        return String(item)
      })
      .join(', ')
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    // FHIR CodeableConcept
    if (obj.text) return String(obj.text)
    if (obj.coding && Array.isArray(obj.coding)) {
      return formatFieldValue(obj.coding)
    }
    if (obj.display) return String(obj.display)
    if (obj.code) return String(obj.code)
    return JSON.stringify(value)
  }
  return String(value)
}

function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  return obj[key]
}

interface ConflictDiffViewProps {
  entry: SyncQueueEntry
  onResolved: () => void
}

const PHYSICIAN_ROLES = ['DOCTOR', 'physician', 'PHYSICIAN']

export function ConflictDiffView({ entry, onResolved }: ConflictDiffViewProps) {
  const practitionerRef = useAuthSessionStore((s) => s.session?.practitionerId ?? '')
  const userRole = useAuthSessionStore((s) => s.session?.role ?? '')
  const canResolve = PHYSICIAN_ROLES.includes(userRole)
  const [resolving, setResolving] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ResolutionType | null>(null)
  const [error, setError] = useState<string | null>(null)

  const localData = useMemo(() => {
    try {
      return JSON.parse(entry.payload) as Record<string, unknown>
    } catch {
      return {} as Record<string, unknown>
    }
  }, [entry.payload])

  const remoteData = useMemo(() => {
    try {
      return entry.conflictData
        ? (JSON.parse(entry.conflictData) as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }, [entry.conflictData])

  const displayFields = useMemo(
    () => getDisplayFields(entry.resourceType),
    [entry.resourceType],
  )

  const fieldDiffs = useMemo(() => {
    if (!remoteData) return []
    return displayFields.map((field) => {
      const localVal = getNestedValue(localData, field)
      const remoteVal = getNestedValue(remoteData, field)
      const localStr = formatFieldValue(localVal)
      const remoteStr = formatFieldValue(remoteVal)
      return {
        field,
        localValue: localStr,
        remoteValue: remoteStr,
        isDifferent: localStr !== remoteStr,
      }
    })
  }, [localData, remoteData, displayFields])

  const isTier1 = isTier1Resource(entry.resourceType)

  const executeResolve = useCallback(
    async (resolutionType: ResolutionType) => {
      setResolving(true)
      setError(null)
      setConfirmAction(null)
      try {
        const result = await resolveConflict({
          entryId: entry.id,
          resolutionType,
          practitionerRef,
        })
        if (result.success) {
          onResolved()
        } else {
          setError('Resolution failed — conflict may already be resolved.')
        }
      } catch {
        setError('An error occurred while resolving the conflict.')
      } finally {
        setResolving(false)
      }
    },
    [entry.id, practitionerRef, onResolved],
  )

  const handleResolve = useCallback(
    (resolutionType: ResolutionType) => {
      // Tier 1 non-append actions require confirmation
      if (isTier1 && resolutionType !== 'keep-both') {
        setConfirmAction(resolutionType)
        return
      }
      executeResolve(resolutionType)
    },
    [isTier1, executeResolve],
  )

  if (!remoteData) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-800">
          Remote version data is not available for this conflict.
          The conflict may need to be retried via sync.
        </p>
      </div>
    )
  }

  return (
    <div data-testid="conflict-diff-view">
      {/* Tier 1 safety warning */}
      {isTier1 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3" role="alert">
          <p className="text-xs font-bold text-amber-800">
            Safety-Critical Resource — &quot;Keep Both&quot; is recommended (append-only merge)
          </p>
          <p className="text-xs text-amber-700">
            &quot;Prefer Local&quot; or &quot;Prefer Remote&quot; will discard one version. Use with caution.
          </p>
        </div>
      )}

      {/* Side-by-side diff grid — uses logical properties for RTL */}
      <div
        className="grid grid-cols-[1fr_1fr] gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200"
        data-testid="diff-grid"
      >
        {/* Column headers */}
        <div className="bg-blue-50 ps-4 pe-4 py-2">
          <span className="text-xs font-bold text-blue-800">Local Version</span>
        </div>
        <div className="bg-purple-50 ps-4 pe-4 py-2">
          <span className="text-xs font-bold text-purple-800">Remote Version</span>
        </div>

        {/* Field rows */}
        {fieldDiffs.map(({ field, localValue, remoteValue, isDifferent }) => (
          <div key={field} className="contents">
            <div
              className={`ps-4 pe-4 py-2 ${
                isDifferent ? 'bg-yellow-50' : 'bg-white'
              }`}
            >
              <p className="text-xs font-semibold text-neutral-500">{field}</p>
              <p className="mt-0.5 text-sm text-neutral-900 break-words">{localValue}</p>
            </div>
            <div
              className={`ps-4 pe-4 py-2 ${
                isDifferent ? 'bg-yellow-50' : 'bg-white'
              }`}
            >
              <p className="text-xs font-semibold text-neutral-500">{field}</p>
              <p className="mt-0.5 text-sm text-neutral-900 break-words">{remoteValue}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Resolution actions */}
      {!canResolve ? (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-xs font-semibold text-neutral-600">
            Only physicians can resolve conflicts. Please contact a physician to review.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {/* Keep Both — default, emphasized for Tier 1 */}
          <button
            type="button"
            onClick={() => handleResolve('keep-both')}
            disabled={resolving}
            className={`inline-flex items-center gap-1.5 rounded-md ps-4 pe-4 py-2 text-sm font-bold transition-colors disabled:opacity-50 ${
              isTier1
                ? 'border-2 border-green-500 bg-green-50 text-green-800 hover:bg-green-100'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
            data-testid="resolve-keep-both"
          >
            {isTier1 && (
              <span className="text-xs font-bold text-green-600">Recommended</span>
            )}
            Keep Both
          </button>

          {/* Prefer Local — de-emphasized for Tier 1 */}
          <button
            type="button"
            onClick={() => handleResolve('prefer-local')}
            disabled={resolving}
            className="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 ps-4 pe-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-200 disabled:opacity-50"
            data-testid="resolve-prefer-local"
          >
            Prefer Local
          </button>

          {/* Prefer Remote — de-emphasized for Tier 1 */}
          <button
            type="button"
            onClick={() => handleResolve('prefer-remote')}
            disabled={resolving}
            className="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 ps-4 pe-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-200 disabled:opacity-50"
            data-testid="resolve-prefer-remote"
          >
            Prefer Remote
          </button>
        </div>
      )}

      {/* Confirmation dialog for Tier 1 destructive actions */}
      {confirmAction && (
        <div
          className="mt-3 rounded-lg border-2 border-red-300 bg-red-50 p-4"
          role="alertdialog"
          aria-label="Confirm destructive resolution"
          data-testid="confirm-destructive-dialog"
        >
          <p className="text-sm font-bold text-red-800">
            Confirm: {confirmAction === 'prefer-local' ? 'Discard Remote' : 'Discard Local'} Version
          </p>
          <p className="mt-1 text-xs text-red-700">
            You are about to permanently discard one version of a safety-critical record.
            This action cannot be undone. CLAUDE.md recommends &quot;Keep Both&quot; for Tier 1 resources.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => executeResolve(confirmAction)}
              disabled={resolving}
              className="rounded-md bg-red-600 ps-3 pe-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              data-testid="confirm-destructive-yes"
            >
              Yes, discard
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="rounded-md bg-neutral-200 ps-3 pe-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-300"
              data-testid="confirm-destructive-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm font-semibold text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
