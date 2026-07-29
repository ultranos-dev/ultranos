'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { LOINC_CATEGORIES } from '@/lib/loinc-categories'
import { Button } from '@/components/ui/Button'
import { HelpTip } from '@/components/ui/HelpTip'
import type { OcrSuggestion } from '@/lib/trpc'

export interface MetadataFormValues {
  loincCode: string
  loincDisplay: string
  collectionDate: string
  ocrMetadataVerified?: boolean
  ocrSuggestions?: OcrSuggestion[]
}

/** Confidence threshold — fields below this are left blank (AC 4) */
const CONFIDENCE_THRESHOLD = 85

type ConfidenceLevel = 'high' | 'medium' | 'low'

function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= CONFIDENCE_THRESHOLD) return 'high'
  if (confidence >= 60) return 'medium'
  return 'low'
}

function getConfidenceBadgeClasses(level: ConfidenceLevel): string {
  switch (level) {
    case 'high':
      return 'bg-green-100 text-green-800'
    case 'medium':
      return 'bg-yellow-100 text-yellow-800'
    case 'low':
      return 'bg-red-100 text-red-800'
  }
}

function getConfidenceLabel(level: ConfidenceLevel, t: ReturnType<typeof useTranslations<'metadata'>>): string {
  switch (level) {
    case 'high':
      return t('confidenceHigh')
    case 'medium':
      return t('confidenceMedium')
    case 'low':
      return t('confidenceLow')
  }
}

export interface OcrStatus {
  loading: boolean
  available: boolean
  processingTimeMs?: number
}

interface MetadataFormProps {
  onSubmit: (values: MetadataFormValues) => void
  disabled?: boolean
  ocrSuggestions?: OcrSuggestion[]
  ocrStatus?: OcrStatus
}

/**
 * Metadata tagging form for lab result uploads.
 * Test category dropdown (LOINC-mapped) and sample collection date picker.
 * All fields required before upload commit.
 *
 * Story 12.3 — AC 4, 5, 6
 * Story 12.6 — AC 2, 3, 4, 5 (OCR auto-population, confidence badges, confirmation gate)
 */
export function MetadataForm({ onSubmit, disabled, ocrSuggestions, ocrStatus }: MetadataFormProps) {
  const t = useTranslations('metadata')
  const [loincCode, setLoincCode] = useState('')
  const [collectionDate, setCollectionDate] = useState('')
  const [errors, setErrors] = useState<{ category?: string; date?: string; confirm?: string }>({})
  const [confirmed, setConfirmed] = useState(false)

  const hasOcr = ocrSuggestions && ocrSuggestions.length > 0
  const ocrLoincSuggestion = ocrSuggestions?.find((s) => s.field === 'loincCode')
  const ocrDateSuggestion = ocrSuggestions?.find((s) => s.field === 'collectionDate')

  // Auto-populate from OCR suggestions where confidence >= 85% (AC 2, 4)
  // Reset confirmation when suggestions change to prevent stale confirmation (P4)
  useEffect(() => {
    if (!ocrSuggestions) return

    setConfirmed(false)

    const loincSuggestion = ocrSuggestions.find((s) => s.field === 'loincCode')
    const dateSuggestion = ocrSuggestions.find((s) => s.field === 'collectionDate')

    if (loincSuggestion && loincSuggestion.confidence >= CONFIDENCE_THRESHOLD) {
      const valid = LOINC_CATEGORIES.some((cat) => cat.code === loincSuggestion.value)
      if (valid) setLoincCode(loincSuggestion.value)
    }

    if (dateSuggestion && dateSuggestion.confidence >= CONFIDENCE_THRESHOLD) {
      setCollectionDate(dateSuggestion.value)
    }
  }, [ocrSuggestions])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const today = new Date().toISOString().split('T')[0]
    const newErrors: { category?: string; date?: string; confirm?: string } = {}
    if (!loincCode) newErrors.category = t('errorCategory')
    if (!collectionDate) {
      newErrors.date = t('errorDate')
    } else if (collectionDate > today) {
      newErrors.date = t('errorFutureDate')
    }
    if (hasOcr && !confirmed) {
      newErrors.confirm = t('errorConfirm')
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})
    const selected = LOINC_CATEGORIES.find((cat) => cat.code === loincCode)
    onSubmit({
      loincCode,
      loincDisplay: selected?.label ?? loincCode,
      collectionDate,
      ocrMetadataVerified: hasOcr ? confirmed : undefined,
      ocrSuggestions: hasOcr ? ocrSuggestions : undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* OCR Status Banner (AC 7, 8) */}
      {ocrStatus?.loading && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-3 text-sm text-primary" role="status">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {t('ocrAnalyzing')}
        </div>
      )}

      {ocrStatus && !ocrStatus.loading && !ocrStatus.available && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700" role="alert">
          {t('ocrUnavailable')}
        </div>
      )}

      {ocrStatus && !ocrStatus.loading && ocrStatus.available && ocrStatus.processingTimeMs !== undefined && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
          {t('ocrComplete', { time: (ocrStatus.processingTimeMs / 1000).toFixed(1) })}
          {hasOcr
            ? t('ocrSuggestionsFound', { count: ocrSuggestions.length })
            : t('ocrNoSuggestions')}
        </div>
      )}

      {/* Test Category */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <label htmlFor="test-category" className="text-sm font-medium text-foreground">
            {t('testCategory')}
          </label>
          <HelpTip content={t('testCategoryHelp')} />
          {ocrLoincSuggestion && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getConfidenceBadgeClasses(getConfidenceLevel(ocrLoincSuggestion.confidence))}`}
              title={`OCR confidence: ${ocrLoincSuggestion.confidence}%`}
              data-testid="confidence-badge-category"
            >
              {getConfidenceLabel(getConfidenceLevel(ocrLoincSuggestion.confidence), t)}
              {' '}({ocrLoincSuggestion.confidence}%)
            </span>
          )}
        </div>
        <select
          id="test-category"
          value={loincCode}
          onChange={(e) => {
            setLoincCode(e.target.value)
            if (errors.category) setErrors((prev) => ({ ...prev, category: undefined }))
          }}
          disabled={disabled}
          className="rounded-lg border border-border px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">{t('selectCategory')}</option>
          {LOINC_CATEGORIES.map((cat) => (
            <option key={cat.code} value={cat.code}>
              {cat.label}
            </option>
          ))}
        </select>
        {ocrLoincSuggestion && ocrLoincSuggestion.confidence < CONFIDENCE_THRESHOLD && (
          <p className="text-xs text-amber-600">
            {t('ocrLowConfidence')}
          </p>
        )}
        {errors.category && (
          <p className="text-xs text-red-600">{errors.category}</p>
        )}
      </div>

      {/* Collection Date */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <label htmlFor="collection-date" className="text-sm font-medium text-foreground">
            {t('collectionDate')}
          </label>
          <HelpTip content={t('collectionDateHelp')} />
          {ocrDateSuggestion && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getConfidenceBadgeClasses(getConfidenceLevel(ocrDateSuggestion.confidence))}`}
              title={`OCR confidence: ${ocrDateSuggestion.confidence}%`}
              data-testid="confidence-badge-date"
            >
              {getConfidenceLabel(getConfidenceLevel(ocrDateSuggestion.confidence), t)}
              {' '}({ocrDateSuggestion.confidence}%)
            </span>
          )}
        </div>
        <input
          id="collection-date"
          type="date"
          value={collectionDate}
          max={new Date().toISOString().split('T')[0]}
          onChange={(e) => {
            setCollectionDate(e.target.value)
            if (errors.date) setErrors((prev) => ({ ...prev, date: undefined }))
          }}
          disabled={disabled}
          className="rounded-lg border border-border px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        {ocrDateSuggestion && ocrDateSuggestion.confidence < CONFIDENCE_THRESHOLD && (
          <p className="text-xs text-amber-600">
            {t('ocrLowConfidence')}
          </p>
        )}
        {errors.date && (
          <p className="text-xs text-red-600">{errors.date}</p>
        )}
      </div>

      {/* Confirmation Gate (Story 12.6 — AC 5) */}
      {hasOcr && (
        <div className="flex flex-col gap-1">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked)
                if (errors.confirm) setErrors((prev) => ({ ...prev, confirm: undefined }))
              }}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500"
              data-testid="ocr-confirm-checkbox"
            />
            <span className="text-foreground">
              {t('confirmCheckbox')}
            </span>
          </label>
          {errors.confirm && (
            <p className="text-xs text-red-600">{errors.confirm}</p>
          )}
        </div>
      )}

      {/* Submit */}
      <Button
        variant="primary"
        type="submit"
        disabled={disabled}
      >
        {t('submitResults')}
      </Button>
    </form>
  )
}
