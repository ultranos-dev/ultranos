'use client'

import { useTranslations } from 'next-intl'
import { Card } from '@/components/Card'

interface NameInputSectionProps {
  nameGiven: string
  nameFather: string
  nameGrandfather: string
  nameFamily: string
  onNameGivenChange: (value: string) => void
  onNameFatherChange: (value: string) => void
  onNameGrandfatherChange: (value: string) => void
  onNameFamilyChange: (value: string) => void
  errors?: {
    nameGiven?: string
    nameFather?: string
    nameGrandfather?: string
    nameFamily?: string
  }
}

export function NameInputSection({
  nameGiven,
  nameFather,
  nameGrandfather,
  nameFamily,
  onNameGivenChange,
  onNameFatherChange,
  onNameGrandfatherChange,
  onNameFamilyChange,
  errors,
}: NameInputSectionProps) {
  const t = useTranslations('registration')

  // Name groups in entry order: patient's name (given + family), father, grandfather
  const patientName = [nameGiven, nameFamily].filter(Boolean).join(' ')
  const fatherName = nameFather.trim()
  const grandfatherName = nameGrandfather.trim()
  const hasAnyName = !!(patientName || fatherName || grandfatherName)

  return (
    <Card as="fieldset">
      <legend className="text-base font-bold text-foreground mb-4">
        {t('nameSection')}
      </legend>

      <div className="space-y-4">
        {/* Given name */}
        <div>
          <label
            htmlFor="name-given"
            className="mb-1 block text-sm font-semibold text-foreground"
          >
            {t('nameGiven')}
            <span className="text-destructive ms-0.5" aria-hidden="true">*</span>
          </label>
          <input
            id="name-given"
            type="text"
            dir="auto"
            required
            aria-required="true"
            aria-invalid={!!errors?.nameGiven}
            aria-describedby={errors?.nameGiven ? 'name-given-error' : undefined}
            className={`w-full min-h-[44px] rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              errors?.nameGiven
                ? 'border-destructive focus:border-destructive focus:ring-destructive'
                : 'border-border focus:border-primary focus:ring-ring'
            }`}
            placeholder={t('nameGivenPlaceholder')}
            value={nameGiven}
            onChange={(e) => onNameGivenChange(e.target.value)}
          />
          {errors?.nameGiven && (
            <p id="name-given-error" className="mt-1 text-sm text-destructive" role="alert">
              {errors.nameGiven}
            </p>
          )}
        </div>

        {/* Family Name */}
        <div>
          <label
            htmlFor="name-family"
            className="mb-1 block text-sm font-semibold text-foreground"
          >
            {t('nameFamily')}
          </label>
          <input
            id="name-family"
            type="text"
            dir="auto"
            aria-invalid={!!errors?.nameFamily}
            aria-describedby={errors?.nameFamily ? 'name-family-error' : undefined}
            className={`w-full min-h-[44px] rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              errors?.nameFamily
                ? 'border-destructive focus:border-destructive focus:ring-destructive'
                : 'border-border focus:border-primary focus:ring-ring'
            }`}
            placeholder={t('nameFamilyPlaceholder')}
            value={nameFamily}
            onChange={(e) => onNameFamilyChange(e.target.value)}
          />
          {errors?.nameFamily && (
            <p id="name-family-error" className="mt-1 text-sm text-destructive" role="alert">
              {errors.nameFamily}
            </p>
          )}
        </div>

        {/* Father's name */}
        <div>
          <label
            htmlFor="name-father"
            className="mb-1 block text-sm font-semibold text-foreground"
          >
            {t('nameFather')}
          </label>
          <input
            id="name-father"
            type="text"
            dir="auto"
            aria-invalid={!!errors?.nameFather}
            aria-describedby={errors?.nameFather ? 'name-father-error' : undefined}
            className={`w-full min-h-[44px] rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              errors?.nameFather
                ? 'border-destructive focus:border-destructive focus:ring-destructive'
                : 'border-border focus:border-primary focus:ring-ring'
            }`}
            placeholder={t('nameFatherPlaceholder')}
            value={nameFather}
            onChange={(e) => onNameFatherChange(e.target.value)}
          />
          {errors?.nameFather && (
            <p id="name-father-error" className="mt-1 text-sm text-destructive" role="alert">
              {errors.nameFather}
            </p>
          )}
        </div>

        {/* Grandfather's name */}
        <div>
          <label
            htmlFor="name-grandfather"
            className="mb-1 block text-sm font-semibold text-foreground"
          >
            {t('nameGrandfather')}
          </label>
          <input
            id="name-grandfather"
            type="text"
            dir="auto"
            aria-invalid={!!errors?.nameGrandfather}
            aria-describedby={errors?.nameGrandfather ? 'name-grandfather-error' : undefined}
            className={`w-full min-h-[44px] rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              errors?.nameGrandfather
                ? 'border-destructive focus:border-destructive focus:ring-destructive'
                : 'border-border focus:border-primary focus:ring-ring'
            }`}
            placeholder={t('nameGrandfatherPlaceholder')}
            value={nameGrandfather}
            onChange={(e) => onNameGrandfatherChange(e.target.value)}
          />
          {errors?.nameGrandfather && (
            <p id="name-grandfather-error" className="mt-1 text-sm text-destructive" role="alert">
              {errors.nameGrandfather}
            </p>
          )}
        </div>

        {/* Display Name preview — grouped with dividers */}
        {hasAnyName && (
          <div
            className="mt-3 rounded-xl ring-[0.65px] ring-border/50 bg-muted px-4 py-3"
            aria-live="polite"
          >
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              {t('namePreview')}
            </p>
            <p className="text-lg font-bold text-foreground leading-snug" dir="auto">
              {[patientName, fatherName, grandfatherName]
                .filter(Boolean)
                .map((name, i) => (
                  <span key={i}>
                    {i > 0 && (
                      <span className="mx-2.5 inline-block h-3 w-3 rounded-full border-2 border-muted-foreground/40 align-middle select-none" aria-hidden="true" />
                    )}
                    {name}
                  </span>
                ))}
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}
