'use client'

/**
 * ResultEntryForm — Structured result entry form for a single sample.
 *
 * Story 42.4 — AC: 1, 2, 3, 4, 7, 8, 9, 13, 14
 *
 * PHI rule: patient header shows first name + age ONLY (CLAUDE.md Rule #7).
 * All layout uses logical CSS properties for RTL compatibility.
 */

import { useState, useEffect, useCallback, useId } from 'react'
import { useTranslations } from 'next-intl'
import type { ResultTemplate, TemplateField } from '@/lib/result-templates'
import type { LabResult, LabObservation } from '@/lib/db'
import { evaluateFlag, evaluateSelectFlag } from '@/lib/abnormal-flags'
import { computeAutoFields } from '@/lib/auto-calc'

export interface ResultEntryFormProps {
  sampleId: string
  template: ResultTemplate
  patientFirstName: string
  patientAge: number
  patientGender: string
  onSave: (result: Omit<LabResult, 'id'>, observations: Omit<LabObservation, 'id'>[]) => Promise<void>
  onSaveDraft: (result: Omit<LabResult, 'id'>, observations: Omit<LabObservation, 'id'>[]) => Promise<void>
  enteredBy: string
  existingDraft?: {
    result: LabResult
    observations: LabObservation[]
  }
}

type FieldValues = Record<string, string | number | null>
type FieldComments = Record<string, string>

function FlagBadge({ flag }: { flag: string | null }) {
  if (!flag) return null
  const isCritical = flag === 'LL' || flag === 'HH'
  return (
    <span
      aria-label={flag}
      className={[
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold tabular-nums',
        isCritical
          ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
          : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      ].join(' ')}
    >
      {flag}
    </span>
  )
}

function AutoCalcBadge({ formulaDisplay }: { formulaDisplay: string }) {
  return (
    <span
      title={formulaDisplay}
      aria-label={`Auto-calculated: ${formulaDisplay}`}
      className="ms-1 inline-flex cursor-help items-center rounded bg-neutral-100 px-1 py-0.5 text-xs text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400"
    >
      ƒ
    </span>
  )
}

export function ResultEntryForm({
  sampleId,
  template,
  patientFirstName,
  patientAge,
  patientGender,
  onSave,
  onSaveDraft,
  enteredBy,
  existingDraft,
}: ResultEntryFormProps) {
  const t = useTranslations('resultEntry')
  const formId = useId()

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [values, setValues] = useState<FieldValues>(() => {
    const initial: FieldValues = {}
    for (const field of template.fields) {
      initial[field.code] = null
    }
    if (existingDraft) {
      for (const obs of existingDraft.observations) {
        initial[obs.fieldCode] = obs.value
      }
    }
    return initial
  })

  const [fieldComments, setFieldComments] = useState<FieldComments>(() => {
    const initial: FieldComments = {}
    if (existingDraft) {
      for (const obs of existingDraft.observations) {
        if (obs.comment) initial[obs.fieldCode] = obs.comment
      }
    }
    return initial
  })

  const [reportComment, setReportComment] = useState(
    existingDraft?.result.reportComment ?? '',
  )
  const [openCommentFields, setOpenCommentFields] = useState<Set<string>>(new Set())
  const [criticalAcknowledged, setCriticalAcknowledged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)

  // ---------------------------------------------------------------------------
  // Auto-calculation: recompute whenever user-entered values change
  // ---------------------------------------------------------------------------

  const numericValues: Record<string, number | null> = {}
  for (const [k, v] of Object.entries(values)) {
    numericValues[k] = typeof v === 'number' ? v : null
  }
  const computed = computeAutoFields(numericValues, template)

  // ---------------------------------------------------------------------------
  // Flag evaluation
  // ---------------------------------------------------------------------------

  const fieldFlags: Record<string, string | null> = {}
  for (const field of template.fields) {
    if (field.type === 'numeric') {
      const displayValue = field.autoCalc ? computed[field.code] : numericValues[field.code]
      if (displayValue != null) {
        fieldFlags[field.code] = evaluateFlag(displayValue, field, patientAge, patientGender)
      } else {
        fieldFlags[field.code] = null
      }
    } else if (field.type === 'select') {
      const v = values[field.code]
      fieldFlags[field.code] = evaluateSelectFlag(field.code, typeof v === 'string' ? v : null)
    } else {
      fieldFlags[field.code] = null
    }
  }

  const hasCritical = Object.values(fieldFlags).some((f) => f === 'LL' || f === 'HH')

  // Reset critical acknowledgment whenever critical status changes
  useEffect(() => {
    if (!hasCritical) setCriticalAcknowledged(false)
  }, [hasCritical])

  // ---------------------------------------------------------------------------
  // Required field completion check
  // ---------------------------------------------------------------------------

  const allRequiredFilled = template.fields.every((field) => {
    if (!field.required || field.autoCalc) return true
    const v = values[field.code]
    return v !== null && v !== '' && v !== undefined
  })

  const canSubmit = allRequiredFilled && (!hasCritical || criticalAcknowledged) && !saving

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleNumericChange = useCallback(
    (code: string, raw: string) => {
      const parsed = raw === '' ? null : parseFloat(raw)
      setValues((prev) => ({ ...prev, [code]: isNaN(parsed as number) ? null : parsed }))
    },
    [],
  )

  const handleSelectChange = useCallback((code: string, value: string) => {
    setValues((prev) => ({ ...prev, [code]: value || null }))
  }, [])

  const handleTextChange = useCallback((code: string, value: string) => {
    setValues((prev) => ({ ...prev, [code]: value || null }))
  }, [])

  const toggleComment = useCallback((code: string) => {
    setOpenCommentFields((prev) => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
      }
      return next
    })
  }, [])

  function buildObservations(): Omit<LabObservation, 'id'>[] {
    return template.fields.map((field) => {
      const rawValue = field.autoCalc ? computed[field.code] : values[field.code]
      return {
        resultId: '', // filled in by page after result is persisted
        fieldCode: field.code,
        value: rawValue ?? null,
        flag: (fieldFlags[field.code] as LabObservation['flag']) ?? null,
        comment: fieldComments[field.code] || undefined,
      }
    })
  }

  const now = () => new Date().toISOString()

  async function handleSaveDraft() {
    setSavingDraft(true)
    try {
      const resultRecord: Omit<LabResult, 'id'> = {
        sampleId,
        templateId: template.id,
        templateVersion: template.templateVersion,
        status: 'draft',
        reportComment: reportComment || undefined,
        enteredBy,
        enteredAt: existingDraft?.result.enteredAt ?? now(),
        updatedAt: now(),
      }
      await onSaveDraft(resultRecord, buildObservations())
    } finally {
      setSavingDraft(false)
    }
  }

  async function handleComplete() {
    setSaving(true)
    try {
      const resultRecord: Omit<LabResult, 'id'> = {
        sampleId,
        templateId: template.id,
        templateVersion: template.templateVersion,
        status: 'completed',
        reportComment: reportComment || undefined,
        enteredBy,
        enteredAt: existingDraft?.result.enteredAt ?? now(),
        updatedAt: now(),
      }
      await onSave(resultRecord, buildObservations())
    } finally {
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderField(field: TemplateField) {
    const isAutoCalc = !!field.autoCalc
    const displayValue = isAutoCalc
      ? (computed[field.code] ?? '')
      : (values[field.code] ?? '')
    const flag = fieldFlags[field.code]
    const commentOpen = openCommentFields.has(field.code)

    return (
      <div key={field.code} className="border-b border-neutral-100 py-3 dark:border-neutral-800 last:border-0">
        <div className="grid items-start gap-2" style={{ gridTemplateColumns: '1fr auto auto' }}>
          {/* Label + input */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${formId}-${field.code}`}
              className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              {t(field.label.replace('resultEntry.', ''))}
              {field.unit && (
                <span className="ms-1 text-xs text-neutral-400">({field.unit})</span>
              )}
              {isAutoCalc && (
                <AutoCalcBadge formulaDisplay={field.autoCalc!.formulaDisplay} />
              )}
            </label>

            {field.type === 'numeric' && (
              <input
                id={`${formId}-${field.code}`}
                type="number"
                step={field.decimalPrecision != null ? Math.pow(10, -field.decimalPrecision) : 0.01}
                value={displayValue as number | ''}
                readOnly={isAutoCalc}
                onChange={(e) => handleNumericChange(field.code, e.target.value)}
                className={[
                  'w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100',
                  isAutoCalc
                    ? 'cursor-default bg-neutral-100 dark:bg-neutral-700'
                    : 'bg-white',
                ].join(' ')}
                aria-label={t(field.label.replace('resultEntry.', ''))}
                tabIndex={isAutoCalc ? -1 : undefined}
              />
            )}

            {field.type === 'text' && (
              <input
                id={`${formId}-${field.code}`}
                type="text"
                value={(displayValue as string) ?? ''}
                onChange={(e) => handleTextChange(field.code, e.target.value)}
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
              />
            )}

            {field.type === 'select' && (
              <select
                id={`${formId}-${field.code}`}
                value={(values[field.code] as string) ?? ''}
                onChange={(e) => handleSelectChange(field.code, e.target.value)}
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
              >
                <option value="">{t('selectPlaceholder')}</option>
                {field.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.label.replace('resultEntry.', ''))}
                  </option>
                ))}
              </select>
            )}

            {/* Inline field comment */}
            {commentOpen && (
              <textarea
                rows={2}
                placeholder={t('fieldCommentPlaceholder')}
                value={fieldComments[field.code] ?? ''}
                onChange={(e) =>
                  setFieldComments((prev) => ({ ...prev, [field.code]: e.target.value }))
                }
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label={t('fieldCommentAriaLabel', { field: t(field.label.replace('resultEntry.', '')) })}
              />
            )}
          </div>

          {/* Flag badge */}
          <div className="flex items-center pt-7">
            <FlagBadge flag={flag} />
          </div>

          {/* Comment toggle */}
          <div className="flex items-center pt-7">
            <button
              type="button"
              onClick={() => toggleComment(field.code)}
              aria-label={t('toggleFieldComment')}
              aria-expanded={commentOpen}
              className="rounded p-1 text-neutral-400 hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-neutral-500 dark:hover:text-blue-400"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const sortedFields = [...template.fields].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className="flex flex-col gap-0">
      {/* ---- Sticky patient header ---- */}
      <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {patientFirstName}
              <span className="ms-2 text-sm font-normal text-neutral-500 dark:text-neutral-400">
                {t('patientAge', { age: patientAge })}
              </span>
            </p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              {t('sampleId', { id: sampleId })}
            </p>
          </div>
          <span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            {template.loincDisplay}
          </span>
        </div>
      </div>

      {/* ---- Critical alert banner (sticky below header when visible) ---- */}
      {hasCritical && (
        <div
          role="alert"
          className="sticky top-[3.5rem] z-10 flex flex-col gap-2 border-b border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/30"
        >
          <p className="font-semibold text-red-800 dark:text-red-200">
            {t('criticalAlertTitle')}
          </p>
          <p className="text-sm text-red-700 dark:text-red-300">
            {t('criticalAlertBody')}
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-red-700 dark:text-red-300">
            <input
              type="checkbox"
              checked={criticalAcknowledged}
              onChange={(e) => setCriticalAcknowledged(e.target.checked)}
              className="h-4 w-4 rounded border-red-400 text-red-600 focus:ring-red-500"
            />
            {t('criticalAcknowledgeLabel')}
          </label>
        </div>
      )}

      {/* ---- Template fields ---- */}
      <div className="px-4 py-2">
        {sortedFields.map(renderField)}
      </div>

      {/* ---- Report-level comment ---- */}
      <div className="border-t border-neutral-200 px-4 py-4 dark:border-neutral-700">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t('reportComment')}
        </label>
        <textarea
          rows={3}
          value={reportComment}
          onChange={(e) => setReportComment(e.target.value)}
          placeholder={t('reportCommentPlaceholder')}
          className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
        />
      </div>

      {/* ---- Sticky action bar ---- */}
      <div className="sticky bottom-0 z-10 flex justify-end gap-3 border-t border-neutral-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={savingDraft || saving}
          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
        >
          {savingDraft ? t('savingDraft') : t('saveAsDraft')}
        </button>
        <button
          type="button"
          onClick={handleComplete}
          disabled={!canSubmit}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
        >
          {saving ? t('completing') : t('completeAndSubmit')}
        </button>
      </div>
    </div>
  )
}
