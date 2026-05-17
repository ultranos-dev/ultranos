'use client'

import { useState } from 'react'
import type { FulfillmentItem } from '@/stores/fulfillment-store'
import { MedicationLabel } from './MedicationLabel'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية (Arabic)' },
  { code: 'fa', label: 'دری (Dari)' },
] as const

type LanguageCode = (typeof LANGUAGES)[number]['code']

function isRtl(lang: LanguageCode): boolean {
  return lang === 'ar' || lang === 'fa'
}

interface LabelPreviewPanelProps {
  items: FulfillmentItem[]
  patientLanguage?: string
  pharmacyName?: string
  dispensingDate?: string
  onClose?: () => void
}

export function LabelPreviewPanel({
  items,
  patientLanguage,
  pharmacyName,
  dispensingDate,
  onClose,
}: LabelPreviewPanelProps) {
  const defaultLang = (
    patientLanguage && ['en', 'ar', 'fa'].includes(patientLanguage)
      ? patientLanguage
      : 'en'
  ) as LanguageCode

  const [locale, setLocale] = useState<LanguageCode>(defaultLang)

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 p-8 text-center">
        <p className="text-neutral-500">No labels to preview.</p>
      </div>
    )
  }

  const dir = isRtl(locale) ? 'rtl' : 'ltr'

  return (
    <div className="space-y-4" dir={dir}>
      {/* Header with language selector and print button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              data-testid="close-label-preview-btn"
              type="button"
              onClick={onClose}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
              aria-label="Close label preview"
            >
              &larr; Back
            </button>
          )}
          <h3 className="text-lg font-semibold text-neutral-800">Label Preview</h3>
        </div>
        <div className="flex items-center gap-3">
          <select
            data-testid="language-selector"
            value={locale}
            onChange={(e) => setLocale(e.target.value as LanguageCode)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>

          <button
            data-testid="print-all-labels-btn"
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-700"
          >
            Print All Labels
          </button>
        </div>
      </div>

      {/* Label cards */}
      <div className="space-y-4">
        {items.map((item) => (
          <MedicationLabel
            key={item.prescription.id}
            item={item}
            dir={dir}
            locale={locale}
            pharmacyName={pharmacyName}
            dispensingDate={dispensingDate}
          />
        ))}
      </div>
    </div>
  )
}
