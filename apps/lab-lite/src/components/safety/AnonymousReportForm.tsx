'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { SafetyConcernCategory } from '@/types/safety-reporting'
import { submitAnonymousReport } from '@/lib/safety/safety-report-service'
import { Button } from '@/components/ui/Button'
import {
  Droplets,
  ShieldAlert,
  Trash2,
  AlertTriangle,
  ClipboardList,
  Lock,
} from '@ultranos/ui-kit/icons'
import type { ComponentType } from 'react'

const CATEGORIES = [
  SafetyConcernCategory.HAND_HYGIENE,
  SafetyConcernCategory.PPE_NON_USE,
  SafetyConcernCategory.IMPROPER_WASTE_DISPOSAL,
  SafetyConcernCategory.EQUIPMENT_MISUSE,
  SafetyConcernCategory.OTHER,
] as const

// Lucide icons per category (CLAUDE.md: standardize on lucide, no emoji/inline).
const CATEGORY_ICONS: Record<SafetyConcernCategory, ComponentType<{ className?: string }>> = {
  [SafetyConcernCategory.HAND_HYGIENE]: Droplets,
  [SafetyConcernCategory.PPE_NON_USE]: ShieldAlert,
  [SafetyConcernCategory.IMPROPER_WASTE_DISPOSAL]: Trash2,
  [SafetyConcernCategory.EQUIPMENT_MISUSE]: AlertTriangle,
  [SafetyConcernCategory.OTHER]: ClipboardList,
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
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-success/30 bg-success/10 p-6 text-center shadow-card ring-[0.65px] ring-border/50">
          <div className="mb-3 text-3xl">✅</div>
          <h2 className="mb-2 text-lg font-semibold text-success">
            {t('confirmationTitle')}
          </h2>
          <p className="mb-4 text-sm text-success">
            {t('confirmationMessage')}
          </p>
          <p className="mb-6 font-mono text-xs text-success">
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
    <div className="flex flex-col gap-4">
      {/* Privacy notice */}
      <div className="rounded-lg border border-primary bg-primary/10 p-4">
        <div className="flex items-start gap-3">
          <Lock className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-primary">
              {t('privacyNoticeTitle')}
            </h3>
            <p className="mt-1 text-sm text-primary">
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
          {CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICONS[cat]
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`flex items-center gap-3 rounded-lg border-2 p-4 text-start transition-colors ${
                  category === cat
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-border'
                }`}
              >
                <Icon className="h-6 w-6" />
                <span className="text-sm font-medium">
                  {t(`category.${cat}`)}
                </span>
              </button>
            )
          })}
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
          className="w-full rounded-lg border border-border p-3 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {details.length > 0 && !detailsValid && (
          <p className="mt-1 text-xs text-warning">
            {t('detailsMinLength')}
          </p>
        )}
      </div>

      {/* Error display */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
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
