'use client'

/**
 * Story 43.7 — Pre-Release Critical Value Checklist Component (Task 3)
 *
 * Modal dialog that appears when a supervisor clicks "Release" and critical
 * values are detected. Blocks release until all required items are checked.
 *
 * Auto-verification: items with evidence from prior stories (43.2, 43.4, 43.5)
 * are pre-checked. Supervisor can uncheck them if they disagree.
 *
 * RTL support: logical CSS properties throughout (margin-inline-start, etc.)
 * PHI: No patient names or IDs in this component. Only analyte names + directions.
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, CircleCheck, CircleX } from '@ultranos/ui-kit/icons'
import type { CriticalValueMatch, ChecklistItem, CompletedChecklist, ChecklistConfig } from '@/lib/critical-values/types'
import { DEFAULT_CHECKLIST_CONFIG_ITEMS } from '@/lib/critical-values/default-thresholds'
import { getChecklistConfig } from '@/lib/db'
import { hlc, serializeHlc } from '@/lib/hlc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

// ---------------------------------------------------------------------------
// Auto-verification context — evidence from prior stories
// ---------------------------------------------------------------------------

export interface AutoVerifyContext {
  /** Story 43.2: QC passed today for the relevant analyte */
  qcPassedToday?: boolean
  /** Story 43.4: Patient ID two-identifier verification is complete for this sample */
  patientIdVerified?: boolean
  /** Story 43.5: No unacknowledged CRITICAL plausibility flags */
  plausibilityOk?: boolean
  /** Story 43.5: Delta check ran (true = ran, null = no prior result) */
  deltaCheckRan?: boolean | null
}

interface Props {
  resultId: string
  criticalValues: CriticalValueMatch[]
  autoVerify?: AutoVerifyContext
  onRelease: (completedChecklist: CompletedChecklist) => void
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CriticalValueChecklist({
  resultId,
  criticalValues,
  autoVerify = {},
  onRelease,
  onCancel,
}: Props) {
  const t = useTranslations('criticalValueChecklist')
  const session = useAuthSessionStore((s) => s.session)

  const [items, setItems] = useState<ChecklistItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Build checklist items: merge lab config with defaults, apply auto-verification
  useEffect(() => {
    async function buildItems() {
      let configItems = DEFAULT_CHECKLIST_CONFIG_ITEMS

      // Merge in lab-specific config if available
      try {
        const labConfig: ChecklistConfig | undefined = await getChecklistConfig()
        if (labConfig?.items?.length) {
          configItems = labConfig.items
        }
      } catch {
        // Gracefully degrade to defaults
      }

      const built: ChecklistItem[] = configItems.map((cfg) => {
        const base: ChecklistItem = {
          id: cfg.id,
          label: cfg.label,
          isRequired: cfg.isRequired,
          isChecked: false,
          isAutoVerified: false,
          isNotApplicable: false,
        }

        // Apply auto-verification for default items (AC: 3.4)
        switch (cfg.id) {
          case 'qc-passed-today':
            if (autoVerify.qcPassedToday === true) {
              base.isChecked = true
              base.isAutoVerified = true
            }
            break
          case 'patient-id-verified':
            if (autoVerify.patientIdVerified === true) {
              base.isChecked = true
              base.isAutoVerified = true
            }
            break
          case 'result-plausibility':
            if (autoVerify.plausibilityOk === true) {
              base.isChecked = true
              base.isAutoVerified = true
            }
            break
          case 'delta-check-reviewed':
            if (autoVerify.deltaCheckRan === null) {
              // No prior result — mark as N/A
              base.isChecked = true
              base.isNotApplicable = true
            } else if (autoVerify.deltaCheckRan === true) {
              base.isChecked = true
              base.isAutoVerified = true
            }
            break
          case 'repeat-testing':
            // Never auto-checked — manual only (AC: 3.4)
            break
          default:
            break
        }

        return base
      })

      setItems(built)
      setIsLoading(false)
    }

    void buildItems()
  }, [autoVerify])

  const toggleItem = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const nowChecked = !item.isChecked
        return {
          ...item,
          isChecked: nowChecked,
          // If supervisor manually unchecks an auto-verified item, clear the auto-verified flag
          isAutoVerified: item.isAutoVerified && nowChecked ? item.isAutoVerified : false,
          checkedBy: nowChecked ? (session?.userId ?? 'unknown') : undefined,
          checkedAt: nowChecked ? new Date().toISOString() : undefined,
        }
      }),
    )
  }, [session])

  // Release is enabled only when all required items are checked (AC: #2)
  const allRequiredChecked = items.every((item) => !item.isRequired || item.isChecked)

  const handleRelease = useCallback(() => {
    if (!allRequiredChecked) return

    const completedChecklist: CompletedChecklist = {
      id: crypto.randomUUID(),
      resultId,
      items,
      completedBy: session?.userId ?? 'unknown',
      completedAt: new Date().toISOString(),
      hlcTimestamp: serializeHlc(hlc.now()),
      syncStatus: 'local',
    }

    onRelease(completedChecklist)
  }, [allRequiredChecked, resultId, items, session, onRelease])

  return (
    // Overlay
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checklist-title"
      data-testid="critical-value-checklist-modal"
    >
      {/* Modal panel */}
      <div className="relative w-full max-w-lg rounded-xl bg-card shadow-2xl mx-4">
        {/* Header */}
        <div className="flex items-start gap-3 rounded-t-xl bg-red-50 border-b border-red-200 p-4">
          <AlertTriangle
            className="mt-0.5 shrink-0 text-red-600"
            aria-hidden="true"
            size={22}
          />
          <div>
            <h2
              id="checklist-title"
              className="text-base font-semibold text-red-900"
            >
              {t('title')}
            </h2>
            <p className="mt-0.5 text-sm text-red-700">{t('subtitle')}</p>
          </div>
        </div>

        {/* Critical values summary */}
        {criticalValues.length > 0 && (
          <div className="px-4 pt-3 pb-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              {t('criticalValuesDetected')}
            </p>
            <div className="flex flex-wrap gap-2">
              {criticalValues.map((cv, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    cv.direction === 'HIGH'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                  data-testid={`critical-badge-${cv.analyte}`}
                >
                  {cv.analyte} — {cv.direction === 'HIGH' ? t('directionHigh') : t('directionLow')}
                  {cv.unit ? ` (> ${cv.threshold} ${cv.unit})` : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Checklist items */}
        <div className="px-4 py-3 space-y-2 max-h-72 overflow-y-auto">
          {isLoading ? (
            <div className="py-4 text-center text-sm text-muted-foreground">…</div>
          ) : (
            items.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                onToggle={toggleItem}
                labelOverride={getItemLabel(t, item.id, item.label)}
                tAutoVerified={t('autoVerified')}
                tNotApplicable={t('notApplicable')}
              />
            ))
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 border-t border-border/50 px-4 py-3 rounded-b-xl">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/30 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            data-testid="checklist-cancel-button"
          >
            {t('cancelButton')}
          </button>
          <button
            type="button"
            onClick={handleRelease}
            disabled={!allRequiredChecked || isLoading}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            data-testid="checklist-release-button"
            aria-disabled={!allRequiredChecked || isLoading}
          >
            {t('releaseButton')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ChecklistRow sub-component
// ---------------------------------------------------------------------------

interface ChecklistRowProps {
  item: ChecklistItem
  onToggle: (id: string) => void
  labelOverride: string
  tAutoVerified: string
  tNotApplicable: string
}

function ChecklistRow({
  item,
  onToggle,
  labelOverride,
  tAutoVerified,
  tNotApplicable,
}: ChecklistRowProps) {
  const isEffectivelyChecked = item.isChecked

  return (
    <label
      className="flex items-start gap-3 cursor-pointer group"
      data-testid={`checklist-item-${item.id}`}
    >
      {/* Checkbox */}
      <span className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          checked={isEffectivelyChecked}
          onChange={() => onToggle(item.id)}
          className="peer sr-only"
          aria-label={labelOverride}
        />
        <span
          className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
            isEffectivelyChecked
              ? item.isAutoVerified
                ? 'border-green-500 bg-green-500'
                : 'border-blue-600 bg-blue-600'
              : 'border-border bg-card group-hover:border-border'
          }`}
          aria-hidden="true"
        >
          {isEffectivelyChecked && (
            <CircleCheck size={12} className="text-white" aria-hidden="true" />
          )}
        </span>
      </span>

      {/* Label + badges */}
      <span className="flex-1 min-w-0">
        <span
          className={`text-sm ${
            isEffectivelyChecked ? 'text-foreground' : 'text-foreground'
          } ${item.isNotApplicable ? 'text-muted-foreground' : ''}`}
        >
          {labelOverride}
        </span>
        {item.isAutoVerified && (
          <span
            className="ms-2 inline-flex items-center gap-0.5 rounded-full bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-700"
            data-testid={`auto-verified-badge-${item.id}`}
          >
            <CircleCheck size={10} aria-hidden="true" />
            {tAutoVerified}
          </span>
        )}
        {item.isNotApplicable && (
          <span
            className="ms-2 inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
            data-testid={`na-badge-${item.id}`}
          >
            <CircleX size={10} aria-hidden="true" />
            {tNotApplicable}
          </span>
        )}
        {item.isRequired && !isEffectivelyChecked && (
          <span className="ms-2 text-xs text-red-500">*</span>
        )}
      </span>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getItemLabel(
  t: ReturnType<typeof useTranslations<'criticalValueChecklist'>>,
  itemId: string,
  fallbackLabel: string,
): string {
  // Map default item IDs to i18n keys; fall back to the item's configured label for custom items
  const knownIds = [
    'qc-passed-today',
    'patient-id-verified',
    'result-plausibility',
    'delta-check-reviewed',
    'repeat-testing',
  ] as const

  if ((knownIds as readonly string[]).includes(itemId)) {
    return t(`items.${itemId as (typeof knownIds)[number]}`)
  }

  return fallbackLabel
}
