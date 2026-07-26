'use client'

import { useState, useMemo, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import type { SyncQueueEntry } from '@/lib/db'
import {
  resolveConflict,
  isTier1Resource,
  type ResolutionType,
} from '@/lib/conflict-resolution'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { Button } from '@/components/ui/Button'
import { Alert } from '@ultranos/ui-kit/components/ui/alert'

/**
 * FHIR field keys whose translations live in conflicts.field.*.
 * Falls back to the raw key if not mapped.
 */
const FIELD_LABEL_KEYS = new Set([
  'clinicalStatus',
  'verificationStatus',
  'type',
  'category',
  'criticality',
  'code',
  'reaction',
  'onsetDateTime',
  'note',
  'status',
  'intent',
  'medicationCodeableConcept',
  'dosageInstruction',
  'dispenseRequest',
  'severity',
  'bodySite',
  'substance',
  'display',
  'text',
])

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
  if (value === null || value === undefined) return '·'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '(empty)'
    // For FHIR coding arrays, show display text
    return value
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>
          return (obj.display ?? obj.text ?? obj.code ?? '(complex value)') as string
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
    return '(complex value)'
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
  const t = useTranslations('conflicts')
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
          setError(t('resolutionFailed'))
        }
      } catch {
        setError(t('resolutionError'))
      } finally {
        setResolving(false)
      }
    },
    [entry.id, practitionerRef, onResolved, t],
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
      <div className="rounded-xl border border-warning/20 bg-warning/10 p-4">
        <p className="text-sm text-warning">
          {t('remoteUnavailable')}
        </p>
      </div>
    )
  }

  return (
    <div data-testid="conflict-diff-view">
      {/* Tier 1 safety warning */}
      {isTier1 && (
        <Alert variant="warning" role="alert" className="mb-4">
          <p className="text-xs font-semibold text-warning">
            {t('safetyRecommendation')}
          </p>
          <p className="text-xs text-warning">
            {t('safetyRecommendationDetail')}
          </p>
        </Alert>
      )}

      {/* Side-by-side diff grid — uses logical properties for RTL */}
      <div
        className="grid grid-cols-[1fr_1fr] gap-px overflow-hidden rounded-xl ring-[0.65px] ring-border/50 bg-secondary lg:max-h-[70svh] lg:overflow-y-auto"
        data-testid="diff-grid"
      >
        {/* Column headers */}
        <div className="bg-primary/10 ps-4 pe-4 py-2">
          <span className="text-xs font-semibold text-primary">{t('localVersion')}</span>
        </div>
        <div className="bg-secondary ps-4 pe-4 py-2">
          <span className="text-xs font-semibold text-foreground">{t('remoteVersion')}</span>
        </div>

        {/* Field rows */}
        {fieldDiffs.map(({ field, localValue, remoteValue, isDifferent }) => {
          const fieldLabel = FIELD_LABEL_KEYS.has(field)
            ? t(`field.${field}` as Parameters<typeof t>[0])
            : field
          return (
            <div key={field} className="contents">
              <div
                className={`ps-4 pe-4 py-2 ${
                  isDifferent ? 'bg-warning/10' : 'bg-background'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {fieldLabel}
                  </p>
                  {isDifferent && (
                    <span
                      className="text-xs font-semibold text-warning"
                      aria-label="Value differs from remote version"
                    >
                      {t('differs')}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-foreground break-words">{localValue}</p>
              </div>
              <div
                className={`ps-4 pe-4 py-2 ${
                  isDifferent ? 'bg-warning/10' : 'bg-background'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {fieldLabel}
                  </p>
                  {isDifferent && (
                    <span
                      className="text-xs font-semibold text-warning"
                      aria-label="Value differs from local version"
                    >
                      {t('differs')}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-foreground break-words">{remoteValue}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Resolution actions */}
      {!canResolve ? (
        <div className="mt-4 rounded-xl ring-[0.65px] ring-border/50 bg-muted p-3">
          <p className="text-xs font-semibold text-muted-foreground">
            {t('physicianOnly')}
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {/* Keep Both — default, emphasized for Tier 1 */}
          <Button
            variant="primary"
            className="gap-1.5"
            type="button"
            onClick={() => handleResolve('keep-both')}
            disabled={resolving}
            data-testid="resolve-keep-both"
          >
            {isTier1 && (
              <span className="text-xs font-semibold text-success">{t('recommended')}</span>
            )}
            {t('keepBoth')}
          </Button>

          {/* Prefer Local — de-emphasized for Tier 1 */}
          <Button
            variant="secondary"
            className="gap-1.5"
            type="button"
            onClick={() => handleResolve('prefer-local')}
            disabled={resolving}
            data-testid="resolve-prefer-local"
          >
            {t('preferLocal')}
          </Button>

          {/* Prefer Remote — de-emphasized for Tier 1 */}
          <Button
            variant="secondary"
            className="gap-1.5"
            type="button"
            onClick={() => handleResolve('prefer-remote')}
            disabled={resolving}
            data-testid="resolve-prefer-remote"
          >
            {t('preferRemote')}
          </Button>
        </div>
      )}

      {/* Confirmation dialog for Tier 1 destructive actions */}
      {confirmAction && (
        <Alert
          variant="destructive"
          role="alertdialog"
          aria-label="Confirm destructive resolution"
          data-testid="confirm-destructive-dialog"
          className="mt-3"
        >
          <p className="text-sm font-semibold text-destructive">
            {t('confirmDestructiveTitle', {
              action: confirmAction === 'prefer-local' ? t('discardRemote') : t('discardLocal'),
            })}
          </p>
          <p className="mt-1 text-xs text-destructive">
            {t('confirmDestructiveWarning')}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="danger"
              type="button"
              onClick={() => executeResolve(confirmAction)}
              disabled={resolving}
              data-testid="confirm-destructive-yes"
            >
              {t('confirmYes')}
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => setConfirmAction(null)}
              data-testid="confirm-destructive-cancel"
            >
              {t('confirmCancel')}
            </Button>
          </div>
        </Alert>
      )}

      {error && (
        <p className="mt-2 text-sm font-semibold text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
