'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { SafetyConcernCategory } from '@/types/safety-reporting'
import { submitAnonymousReport } from '@/lib/safety/safety-report-service'
import { Button } from '@/components/ui/Button'

const CATEGORIES = [
  SafetyConcernCategory.HAND_HYGIENE,
  SafetyConcernCategory.PPE_NON_USE,
  SafetyConcernCategory.IMPROPER_WASTE_DISPOSAL,
  SafetyConcernCategory.EQUIPMENT_MISUSE,
  SafetyConcernCategory.OTHER,
] as const

const CATEGORY_ICONS: Record<SafetyConcernCategory, string> = {
  [SafetyConcernCategory.HAND_HYGIENE]: '🧴',
  [SafetyConcernCategory.PPE_NON_USE]: '🧤',
  [SafetyConcernCategory.IMPROPER_WASTE_DISPOSAL]: '🗑️',
  [SafetyConcernCategory.EQUIPMENT_MISUSE]: '⚠️',
  [SafetyConcernCategory.OTHER]: '📋',
}

interface AnonymousReportFormProps {
  onSubmitted?: () => void
}

export function AnonymousReportForm({ onSubmitted }: AnonymousReportFormProps) {
  const t = useTranslations('safety.reporting')
  const [category, setCategory] = useState<SafetyConcernCategory | null>(null)
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [reportId, setReportId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const detailsValid = details.trim().length >= 10

  async function handleSubmit() {
    if (!category || !detailsValid) return

    setSubmitting(true)
    setError(null)

    try {
      const id = await submitAnonymousReport({ category, details: details.trim() })
      setReportId(id)
      setSubmitted(true)
      onSubmitted?.()
    } catch {
      setError(t('submitError'))
    } finally {
      setSubmitting(false)
    }
  }

  function handleReset() {
    setCategory(null)
    setDetails('')
    setSubmitted(false)
    setReportId(null)
    setError(null)
  }

  if (submitted && reportId) {
    return (
      <div className="mx-auto max-w-lg flex flex-col gap-4">
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
          <div className="mb-3 text-3xl">✅</div>
          <h2 className="mb-2 text-lg font-semibold text-green-800">
            {t('confirmationTitle')}
          </h2>
          <p className="mb-4 text-sm text-green-700">
            {t('confirmationMessage')}
          </p>
          <p className="mb-6 font-mono text-xs text-green-600">
            {t('reportIdLabel')}: {reportId}
          </p>
          <Button variant="secondary" onClick={handleReset}>
            {t('submitAnother')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg flex flex-col gap-4">
      {/* Privacy notice */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">🔒</span>
          <div>
            <h3 className="text-sm font-semibold text-blue-800">
              {t('privacyNoticeTitle')}
            </h3>
            <p className="mt-1 text-sm text-blue-700">
              {t('privacyNoticeBody')}
            </p>
          </div>
        </div>
      </div>

      {/* Category selection */}
      <div>
        <label className="mb-3 block text-sm font-medium text-foreground">
          {t('categoryLabel')}
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`flex items-center gap-3 rounded-lg border-2 p-4 text-start transition-colors ${
                category === cat
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-border hover:border-border'
              }`}
            >
              <span className="text-2xl">{CATEGORY_ICONS[cat]}</span>
              <span className="text-sm font-medium">
                {t(`category.${cat}`)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Details textarea */}
      <div>
        <label
          htmlFor="safety-report-details"
          className="mb-2 block text-sm font-medium text-foreground"
        >
          {t('detailsLabel')}
        </label>
        <textarea
          id="safety-report-details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder={t('detailsPlaceholder')}
          rows={5}
          className="w-full rounded-lg border border-border p-3 text-sm placeholder:text-muted-foreground focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-300"
        />
        {details.length > 0 && !detailsValid && (
          <p className="mt-1 text-xs text-amber-600">
            {t('detailsMinLength')}
          </p>
        )}
      </div>

      {/* Error display */}
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Submit button */}
      <Button
        fullWidth
        disabled={!category || !detailsValid || submitting}
        onClick={handleSubmit}
      >
        {submitting ? t('submitting') : t('submitButton')}
      </Button>
    </div>
  )
}
