'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
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
  const t = useTranslations('labelPreview')

  const defaultLang = (
    patientLanguage && ['en', 'ar', 'fa'].includes(patientLanguage)
      ? patientLanguage
      : 'en'
  ) as LanguageCode

  const [locale, setLocale] = useState<LanguageCode>(defaultLang)

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border p-8 text-center">
        <p className="text-muted-foreground">{t('noLabels')}</p>
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
            <Button
              variant="outline"
              data-testid="close-label-preview-btn"
              type="button"
              onClick={onClose}
              aria-label={t('closeAriaLabel')}
            >
              &larr; {t('back')}
            </Button>
          )}
          <h3 className="text-lg font-semibold text-foreground">{t('title')}</h3>
        </div>
        <div className="flex items-center gap-3">
          <select
            data-testid="language-selector"
            value={locale}
            onChange={(e) => setLocale(e.target.value as LanguageCode)}
            className="rounded-md border border-border px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>

          <Button
            variant="default"
            data-testid="print-all-labels-btn"
            type="button"
            onClick={() => window.print()}
          >
            {t('printAllLabels')}
          </Button>
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
