'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { FileText } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import { ConsentTextModal } from './ConsentTextModal'
import { Card } from '@/components/Card'

type ConsentMethod = 'WRITTEN' | 'VERBAL_WITNESSED'
type ConsentLanguage = 'en' | 'ar' | 'prs'

interface ConsentSectionProps {
  method: ConsentMethod | ''
  witnessedBy: string
  language: ConsentLanguage
  onMethodChange: (method: ConsentMethod) => void
  onWitnessedByChange: (value: string) => void
  onLanguageChange: (language: ConsentLanguage) => void
  errors?: {
    method?: string
    witnessedBy?: string
    language?: string
  }
}

const CONSENT_LANGUAGES: { value: ConsentLanguage; labelKey: string }[] = [
  { value: 'en', labelKey: 'languageEnglish' },
  { value: 'ar', labelKey: 'languageArabic' },
  { value: 'prs', labelKey: 'languageDari' },
]

export function ConsentSection({
  method,
  witnessedBy,
  language,
  onMethodChange,
  onWitnessedByChange,
  onLanguageChange,
  errors,
}: ConsentSectionProps) {
  const t = useTranslations('registration')
  const [consentModalOpen, setConsentModalOpen] = useState(false)

  return (
    <>
    <ConsentTextModal open={consentModalOpen} onClose={() => setConsentModalOpen(false)} />
    <Card as="fieldset">
      <legend className="text-base font-bold text-neutral-900 mb-4">
        {t('consentSection')}
      </legend>

      <div className="space-y-4">
        {/* Consent method radio group */}
        <div role="radiogroup" aria-labelledby="consent-method-label">
          <p
            id="consent-method-label"
            className="mb-2 text-sm font-semibold text-neutral-700"
          >
            {t('consentMethod')}
            <span className="text-red-600 ms-0.5" aria-hidden="true">*</span>
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
            <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
              <input
                type="radio"
                name="consent-method"
                value="WRITTEN"
                checked={method === 'WRITTEN'}
                onChange={() => onMethodChange('WRITTEN')}
                className="h-5 w-5 border-neutral-300 text-blue-600 focus:ring-blue-400"
                aria-invalid={!!errors?.method}
              />
              <span className="text-sm font-medium text-neutral-700">
                {t('consentWritten')}
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
              <input
                type="radio"
                name="consent-method"
                value="VERBAL_WITNESSED"
                checked={method === 'VERBAL_WITNESSED'}
                onChange={() => onMethodChange('VERBAL_WITNESSED')}
                className="h-5 w-5 border-neutral-300 text-blue-600 focus:ring-blue-400"
                aria-invalid={!!errors?.method}
              />
              <span className="text-sm font-medium text-neutral-700">
                {t('consentVerbalWitnessed')}
              </span>
            </label>
          </div>

          {errors?.method && (
            <p className="mt-1 text-sm text-red-600" role="alert">
              {errors.method}
            </p>
          )}
        </div>

        {/* Witness field — shown only for VERBAL_WITNESSED */}
        {method === 'VERBAL_WITNESSED' && (
          <div>
            <label
              htmlFor="consent-witness"
              className="mb-1 block text-sm font-semibold text-neutral-700"
            >
              {t('consentWitness')}
              <span className="text-red-600 ms-0.5" aria-hidden="true">*</span>
            </label>
            <input
              id="consent-witness"
              type="text"
              required
              aria-required="true"
              aria-invalid={!!errors?.witnessedBy}
              aria-describedby={errors?.witnessedBy ? 'consent-witness-error' : undefined}
              className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                errors?.witnessedBy
                  ? 'border-red-400 focus:border-red-400 focus:ring-red-400'
                  : 'border-neutral-300 focus:border-blue-400 focus:ring-blue-400'
              }`}
              placeholder={t('consentWitnessPlaceholder')}
              value={witnessedBy}
              onChange={(e) => onWitnessedByChange(e.target.value)}
            />
            {errors?.witnessedBy && (
              <p id="consent-witness-error" className="mt-1 text-sm text-red-600" role="alert">
                {errors.witnessedBy}
              </p>
            )}
          </div>
        )}

        {/* Consent language dropdown */}
        <div>
          <label
            htmlFor="consent-language"
            className="mb-1 block text-sm font-semibold text-neutral-700"
          >
            {t('consentLanguage')}
            <span className="text-red-600 ms-0.5" aria-hidden="true">*</span>
          </label>
          <select
            id="consent-language"
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as ConsentLanguage)}
            aria-invalid={!!errors?.language}
            className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              errors?.language
                ? 'border-red-400 focus:border-red-400 focus:ring-red-400'
                : 'border-neutral-300 focus:border-blue-400 focus:ring-blue-400'
            }`}
          >
            {CONSENT_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {t(lang.labelKey)}
              </option>
            ))}
          </select>
          {errors?.language && (
            <p className="mt-1 text-sm text-red-600" role="alert">
              {errors.language}
            </p>
          )}
        </div>

        {/* View full consent button */}
        <Button
          variant="outline"
          onClick={() => setConsentModalOpen(true)}
          className="gap-1.5 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
        >
          <FileText className="h-4 w-4" />
          {t('viewFullConsent')}
        </Button>
      </div>
    </Card>
    </>
  )
}
