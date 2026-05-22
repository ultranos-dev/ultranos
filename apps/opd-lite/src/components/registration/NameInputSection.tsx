'use client'

import { useTranslations, useLocale } from 'next-intl'

interface NameInputSectionProps {
  nameGiven: string
  nameFather: string
  nameGrandfather: string
  onNameGivenChange: (value: string) => void
  onNameFatherChange: (value: string) => void
  onNameGrandfatherChange: (value: string) => void
  errors?: {
    nameGiven?: string
    nameFather?: string
    nameGrandfather?: string
  }
}

export function NameInputSection({
  nameGiven,
  nameFather,
  nameGrandfather,
  onNameGivenChange,
  onNameFatherChange,
  onNameGrandfatherChange,
  errors,
}: NameInputSectionProps) {
  const t = useTranslations('registration')
  const locale = useLocale()
  const isRtl = locale === 'ar' || locale === 'prs'

  // Compose the full local name preview (given + father + grandfather)
  const nameParts = [nameGiven, nameFather, nameGrandfather].filter(Boolean)
  const nameLocalPreview = nameParts.length > 0 ? nameParts.join(' ') : ''

  return (
    <fieldset className="rounded-xl bg-card-bg p-5 shadow-sm">
      <legend className="text-base font-bold text-neutral-900 mb-4">
        {t('nameSection')}
      </legend>

      <div className="space-y-4">
        {/* Given name */}
        <div>
          <label
            htmlFor="name-given"
            className="mb-1 block text-sm font-semibold text-neutral-700"
          >
            {t('nameGiven')}
            <span className="text-red-600 ms-0.5" aria-hidden="true">*</span>
          </label>
          <input
            id="name-given"
            type="text"
            dir={isRtl ? 'rtl' : 'ltr'}
            required
            aria-required="true"
            aria-invalid={!!errors?.nameGiven}
            aria-describedby={errors?.nameGiven ? 'name-given-error' : undefined}
            className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              errors?.nameGiven
                ? 'border-red-400 focus:border-red-400 focus:ring-red-400'
                : 'border-neutral-300 focus:border-blue-400 focus:ring-blue-400'
            }`}
            placeholder={t('nameGivenPlaceholder')}
            value={nameGiven}
            onChange={(e) => onNameGivenChange(e.target.value)}
          />
          {errors?.nameGiven && (
            <p id="name-given-error" className="mt-1 text-sm text-red-600" role="alert">
              {errors.nameGiven}
            </p>
          )}
        </div>

        {/* Father's name */}
        <div>
          <label
            htmlFor="name-father"
            className="mb-1 block text-sm font-semibold text-neutral-700"
          >
            {t('nameFather')}
          </label>
          <input
            id="name-father"
            type="text"
            dir={isRtl ? 'rtl' : 'ltr'}
            aria-invalid={!!errors?.nameFather}
            aria-describedby={errors?.nameFather ? 'name-father-error' : undefined}
            className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              errors?.nameFather
                ? 'border-red-400 focus:border-red-400 focus:ring-red-400'
                : 'border-neutral-300 focus:border-blue-400 focus:ring-blue-400'
            }`}
            placeholder={t('nameFatherPlaceholder')}
            value={nameFather}
            onChange={(e) => onNameFatherChange(e.target.value)}
          />
          {errors?.nameFather && (
            <p id="name-father-error" className="mt-1 text-sm text-red-600" role="alert">
              {errors.nameFather}
            </p>
          )}
        </div>

        {/* Grandfather's name */}
        <div>
          <label
            htmlFor="name-grandfather"
            className="mb-1 block text-sm font-semibold text-neutral-700"
          >
            {t('nameGrandfather')}
          </label>
          <input
            id="name-grandfather"
            type="text"
            dir={isRtl ? 'rtl' : 'ltr'}
            aria-invalid={!!errors?.nameGrandfather}
            aria-describedby={errors?.nameGrandfather ? 'name-grandfather-error' : undefined}
            className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              errors?.nameGrandfather
                ? 'border-red-400 focus:border-red-400 focus:ring-red-400'
                : 'border-neutral-300 focus:border-blue-400 focus:ring-blue-400'
            }`}
            placeholder={t('nameGrandfatherPlaceholder')}
            value={nameGrandfather}
            onChange={(e) => onNameGrandfatherChange(e.target.value)}
          />
          {errors?.nameGrandfather && (
            <p id="name-grandfather-error" className="mt-1 text-sm text-red-600" role="alert">
              {errors.nameGrandfather}
            </p>
          )}
        </div>

        {/* Composed nameLocal preview */}
        {nameLocalPreview && (
          <div
            className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3"
            aria-live="polite"
          >
            <p className="text-xs font-semibold text-neutral-500 mb-1">
              {t('namePreview')}
            </p>
            <p
              className="text-lg font-bold text-neutral-900"
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              {nameLocalPreview}
            </p>
          </div>
        )}
      </div>
    </fieldset>
  )
}
