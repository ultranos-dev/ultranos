'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  ChecklistItemStatus,
  type InfectionControlAudit,
  type ChecklistItemTemplate,
  type ChecklistItemResult,
} from '@/types/infection-control-audit'
import { CHECKLIST_CATEGORIES } from '@/lib/safety/default-checklist'
import { calculateComplianceScore } from '@/lib/safety/audit-checklist-service'
import { PhotoCaptureButton } from './PhotoCaptureButton'

interface AuditChecklistViewProps {
  audit: InfectionControlAudit
  templates: ChecklistItemTemplate[]
  onItemUpdate: (
    templateId: string,
    result: {
      status: ChecklistItemStatus
      notes?: string
      photoEvidence?: Blob
      photoFileName?: string
    },
  ) => Promise<void>
  onComplete: () => Promise<void>
  isCompleting?: boolean
}

/** Tailwind classes per status for a checklist item row. */
const ROW_CLASSES: Record<ChecklistItemStatus, string> = {
  [ChecklistItemStatus.PASS]: 'bg-green-50 border-green-200',
  [ChecklistItemStatus.FAIL]: 'bg-red-50 border-red-200',
  [ChecklistItemStatus.NOT_APPLICABLE]: 'bg-gray-50 border-gray-200',
}

/** Tailwind classes for the active status toggle button. */
const ACTIVE_TOGGLE: Record<ChecklistItemStatus, string> = {
  [ChecklistItemStatus.PASS]: 'bg-green-500 text-white border-green-500',
  [ChecklistItemStatus.FAIL]: 'bg-red-500 text-white border-red-500',
  [ChecklistItemStatus.NOT_APPLICABLE]: 'bg-gray-400 text-white border-gray-400',
}

const INACTIVE_TOGGLE = 'bg-card text-muted-foreground border-border hover:bg-muted/30'

export function AuditChecklistView({
  audit,
  templates,
  onItemUpdate,
  onComplete,
  isCompleting = false,
}: AuditChecklistViewProps) {
  const t = useTranslations('safety.audit')

  // Track which sections are expanded
  const defaultExpanded = Object.fromEntries(
    [...CHECKLIST_CATEGORIES, ...getCustomCategories(templates)].map((cat) => [cat, true]),
  )
  const [expanded, setExpanded] = useState<Record<string, boolean>>(defaultExpanded)

  // Confirmation dialog visibility
  const [showConfirm, setShowConfirm] = useState(false)

  // Local notes state so textarea is controlled without waiting for async onItemUpdate
  const [localNotes, setLocalNotes] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const item of audit.items) {
      if (item.notes) map[item.templateId] = item.notes
    }
    return map
  })

  const activeItems = templates.filter((t) => t.isActive)

  /** Map templateId → ChecklistItemResult for quick lookup */
  const resultMap = new Map<string, ChecklistItemResult>(
    audit.items.map((item) => [item.templateId, item]),
  )

  /** Progress: items where completedAt is not null */
  const assessedCount = audit.items.filter((i) => i.completedAt !== null).length
  const totalCount = activeItems.length

  /** All items have been assessed (completedAt set) */
  const allAssessed = totalCount > 0 && assessedCount === totalCount

  /** Ordered categories: default first, then custom alphabetically */
  const orderedCategories = buildCategoryOrder(templates)

  /** Group active templates by category */
  const byCategory = groupByCategory(activeItems, orderedCategories)

  function toggleSection(category: string) {
    setExpanded((prev) => ({ ...prev, [category]: !prev[category] }))
  }

  async function handleStatusToggle(templateId: string, status: ChecklistItemStatus) {
    const existing = resultMap.get(templateId)
    await onItemUpdate(templateId, {
      status,
      notes: localNotes[templateId] ?? existing?.notes ?? undefined,
      photoEvidence: existing?.photoEvidence ?? undefined,
      photoFileName: existing?.photoFileName ?? undefined,
    })
  }

  async function handleNotesBlur(templateId: string) {
    const existing = resultMap.get(templateId)
    if (!existing) return
    await onItemUpdate(templateId, {
      status: existing.status,
      notes: localNotes[templateId] ?? '',
      photoEvidence: existing.photoEvidence ?? undefined,
      photoFileName: existing.photoFileName ?? undefined,
    })
  }

  async function handlePhoto(templateId: string, blob: Blob, fileName: string) {
    const existing = resultMap.get(templateId)
    if (!existing) return
    await onItemUpdate(templateId, {
      status: existing.status,
      notes: localNotes[templateId] ?? existing.notes ?? undefined,
      photoEvidence: blob,
      photoFileName: fileName,
    })
  }

  async function handlePhotoRemove(templateId: string) {
    const existing = resultMap.get(templateId)
    if (!existing) return
    await onItemUpdate(templateId, {
      status: existing.status,
      notes: localNotes[templateId] ?? existing.notes ?? undefined,
      photoEvidence: undefined,
      photoFileName: undefined,
    })
  }

  function handleCompleteClick() {
    setShowConfirm(true)
  }

  async function handleConfirmComplete() {
    setShowConfirm(false)
    await onComplete()
  }

  const previewScore = calculateComplianceScore(audit)

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('checklistTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('auditDate')}: {audit.auditDate}
          </p>
          {/* Opaque manager ID — never expand to a name */}
          <p className="text-xs text-muted-foreground">
            {t('conductedBy')}: {audit.conductedBy}
          </p>
        </div>

        {/* Progress indicator */}
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-2 text-center">
          <p className="text-lg font-bold">
            {assessedCount}
            <span className="text-sm font-normal text-muted-foreground"> / {totalCount}</span>
          </p>
          <p className="text-xs text-muted-foreground">{t('itemsAssessed')}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary-500 transition-all"
          style={{ width: totalCount > 0 ? `${(assessedCount / totalCount) * 100}%` : '0%' }}
        />
      </div>

      {/* Category sections */}
      {orderedCategories.map((category) => {
        const items = byCategory[category]
        if (!items || items.length === 0) return null
        const isOpen = expanded[category] ?? true

        return (
          <section
            key={category}
            className="overflow-hidden rounded-lg border border-border"
          >
            {/* Section header */}
            <button
              type="button"
              onClick={() => toggleSection(category)}
              className="flex w-full items-center justify-between bg-muted/30 px-4 py-3 text-start hover:bg-muted"
              aria-expanded={isOpen}
            >
              <span className="font-medium text-foreground">{category}</span>
              <span className="text-muted-foreground">{isOpen ? '▲' : '▼'}</span>
            </button>

            {/* Items */}
            {isOpen && (
              <div className="divide-y divide-border/50">
                {items.map((template) => {
                  const result = resultMap.get(template.id)
                  const status = result?.status ?? null
                  const rowClass =
                    status !== null
                      ? `${ROW_CLASSES[status]} border`
                      : 'bg-card border border-border'
                  const noteValue = localNotes[template.id] ?? ''
                  const showNotes =
                    status === ChecklistItemStatus.FAIL || noteValue.length > 0
                  const showPhoto =
                    template.requiresPhoto || status === ChecklistItemStatus.FAIL

                  return (
                    <div key={template.id} className={`p-4 ${rowClass} rounded-none`}>
                      {/* Description + toggles */}
                      <div className="flex flex-wrap items-start gap-3">
                        <p className="flex-1 text-sm text-foreground">{template.description}</p>

                        {/* Status toggles */}
                        <div className="flex shrink-0 gap-1">
                          {(
                            [
                              ChecklistItemStatus.PASS,
                              ChecklistItemStatus.FAIL,
                              ChecklistItemStatus.NOT_APPLICABLE,
                            ] as const
                          ).map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => void handleStatusToggle(template.id, s)}
                              aria-pressed={status === s}
                              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                                status === s ? ACTIVE_TOGGLE[s] : INACTIVE_TOGGLE
                              }`}
                            >
                              {s === ChecklistItemStatus.PASS
                                ? t('statusPass')
                                : s === ChecklistItemStatus.FAIL
                                  ? t('statusFail')
                                  : t('statusNA')}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Notes (shown when FAIL, or when notes already exist) */}
                      {showNotes && (
                        <textarea
                          value={noteValue}
                          onChange={(e) =>
                            setLocalNotes((prev) => ({
                              ...prev,
                              [template.id]: e.target.value,
                            }))
                          }
                          onBlur={() => void handleNotesBlur(template.id)}
                          placeholder={t('notesPlaceholder')}
                          rows={2}
                          className="mt-2 w-full rounded-md border border-border p-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary-400"
                        />
                      )}

                      {/* Photo capture */}
                      {showPhoto && (
                        <div className="mt-2">
                          <PhotoCaptureButton
                            existingPhoto={result?.photoEvidence ?? null}
                            existingFileName={result?.photoFileName ?? null}
                            onCapture={(blob, fileName) =>
                              void handlePhoto(template.id, blob, fileName)
                            }
                            onRemove={() => void handlePhotoRemove(template.id)}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}

      {/* Complete button */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleCompleteClick}
          disabled={!allAssessed || isCompleting}
          className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-40"
        >
          {isCompleting ? t('completing') : t('completeAudit')}
        </button>
      </div>

      {/* Confirmation dialog */}
      {showConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-complete-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-sm rounded-xl bg-card p-6 shadow-xl">
            <h3 id="confirm-complete-title" className="mb-2 text-base font-semibold">
              {t('confirmCompleteTitle')}
            </h3>

            <p className="mb-4 text-sm text-muted-foreground">
              {t('confirmCompleteBody')}
            </p>

            {/* Compliance score preview */}
            <div className="mb-5 rounded-lg bg-muted/30 p-4 text-center">
              <p className="text-3xl font-bold">
                {previewScore !== null ? `${previewScore}%` : t('scoreNA')}
              </p>
              <p className="text-xs text-muted-foreground">{t('complianceScore')}</p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted/30"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmComplete()}
                className="rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
              >
                {t('confirmComplete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCustomCategories(templates: ChecklistItemTemplate[]): string[] {
  const knownSet = new Set<string>(CHECKLIST_CATEGORIES)
  const customSet = new Set<string>()
  for (const t of templates) {
    if (!knownSet.has(t.category)) customSet.add(t.category)
  }
  return [...customSet].sort()
}

function buildCategoryOrder(templates: ChecklistItemTemplate[]): string[] {
  return [...CHECKLIST_CATEGORIES, ...getCustomCategories(templates)]
}

function groupByCategory(
  templates: ChecklistItemTemplate[],
  order: string[],
): Record<string, ChecklistItemTemplate[]> {
  const groups: Record<string, ChecklistItemTemplate[]> = {}
  for (const cat of order) groups[cat] = []
  for (const tmpl of templates) {
    if (!groups[tmpl.category]) groups[tmpl.category] = []
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    groups[tmpl.category]!.push(tmpl)
  }
  // Sort each group by order field
  for (const cat of Object.keys(groups)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    groups[cat]!.sort((a, b) => a.order - b.order)
  }
  return groups
}
