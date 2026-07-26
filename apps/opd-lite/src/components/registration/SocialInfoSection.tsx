'use client'

import { useTranslations } from 'next-intl'
import { Card } from '@/components/Card'
import type { DisplacementCategory, EducationLevel } from '@ultranos/shared-types'

// ISO 3166-1 alpha-2 codes for the primary nationalities in this deployment context.
const NATIONALITY_OPTIONS = [
  { value: 'AF', labelKey: 'nationalityAF' },
  { value: 'PK', labelKey: 'nationalityPK' },
  { value: 'IR', labelKey: 'nationalityIR' },
  { value: 'TJ', labelKey: 'nationalityTJ' },
  { value: 'UZ', labelKey: 'nationalityUZ' },
  { value: 'TM', labelKey: 'nationalityTM' },
  { value: 'IN', labelKey: 'nationalityIN' },
  { value: 'SA', labelKey: 'nationalitySA' },
  { value: 'AE', labelKey: 'nationalityAE' },
] as const

const DISPLACEMENT_OPTIONS: { value: DisplacementCategory; labelKey: string }[] = [
  { value: 'IDP',            labelKey: 'displacementIDP' },
  { value: 'RETURNEE',       labelKey: 'displacementReturnee' },
  { value: 'REFUGEE',        labelKey: 'displacementRefugee' },
  { value: 'HOST_COMMUNITY', labelKey: 'displacementHostCommunity' },
]

const EDUCATION_OPTIONS: { value: EducationLevel; labelKey: string }[] = [
  { value: 'NONE',      labelKey: 'educationNone' },
  { value: 'PRIMARY',   labelKey: 'educationPrimary' },
  { value: 'SECONDARY', labelKey: 'educationSecondary' },
  { value: 'TERTIARY',  labelKey: 'educationTertiary' },
  { value: 'UNKNOWN',   labelKey: 'educationUnknown' },
]

interface SocialInfoSectionProps {
  displacementCategory: DisplacementCategory | ''
  nationality: string
  occupation: string
  educationLevel: EducationLevel | ''
  disability: boolean
  onDisplacementCategoryChange: (value: DisplacementCategory | '') => void
  onNationalityChange: (value: string) => void
  onOccupationChange: (value: string) => void
  onEducationLevelChange: (value: EducationLevel | '') => void
  onDisabilityChange: (value: boolean) => void
}

export function SocialInfoSection({
  displacementCategory,
  nationality,
  occupation,
  educationLevel,
  disability,
  onDisplacementCategoryChange,
  onNationalityChange,
  onOccupationChange,
  onEducationLevelChange,
  onDisabilityChange,
}: SocialInfoSectionProps) {
  const t = useTranslations('registration')

  return (
    <Card as="fieldset">
      <legend className="text-base font-bold text-foreground">
        {t('socialInfoSection')}
      </legend>

      <div className="space-y-4">
        {/* Displacement / population category */}
        <div>
          <label
            htmlFor="displacement-category"
            className="mb-1 block text-sm font-semibold text-foreground"
          >
            {t('displacementCategory')}
            <span className="ms-1 text-xs font-normal text-muted-foreground">
              ({t('optional')})
            </span>
          </label>
          <select
            id="displacement-category"
            value={displacementCategory}
            onChange={(e) => onDisplacementCategoryChange(e.target.value as DisplacementCategory | '')}
            className="w-full min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{t('displacementNone')}</option>
            {DISPLACEMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Nationality */}
        <div>
          <label
            htmlFor="nationality"
            className="mb-1 block text-sm font-semibold text-foreground"
          >
            {t('nationality')}
            <span className="ms-1 text-xs font-normal text-muted-foreground">
              ({t('optional')})
            </span>
          </label>
          <select
            id="nationality"
            value={nationality}
            onChange={(e) => onNationalityChange(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{t('nationalitySelectPlaceholder')}</option>
            {NATIONALITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Occupation */}
        <div>
          <label
            htmlFor="occupation"
            className="mb-1 block text-sm font-semibold text-foreground"
          >
            {t('occupation')}
            <span className="ms-1 text-xs font-normal text-muted-foreground">
              ({t('optional')})
            </span>
          </label>
          <input
            id="occupation"
            type="text"
            dir="auto"
            maxLength={200}
            className="w-full min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={t('occupationPlaceholder')}
            value={occupation}
            onChange={(e) => onOccupationChange(e.target.value)}
          />
        </div>

        {/* Education level */}
        <div>
          <label
            htmlFor="education-level"
            className="mb-1 block text-sm font-semibold text-foreground"
          >
            {t('educationLevel')}
            <span className="ms-1 text-xs font-normal text-muted-foreground">
              ({t('optional')})
            </span>
          </label>
          <select
            id="education-level"
            value={educationLevel}
            onChange={(e) => onEducationLevelChange(e.target.value as EducationLevel | '')}
            className="w-full min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{t('educationSelectPlaceholder')}</option>
            {EDUCATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Disability */}
        <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            checked={disability}
            onChange={(e) => onDisabilityChange(e.target.checked)}
            className="h-5 w-5 rounded border-border text-primary focus:ring-ring"
          />
          <span className="text-sm font-medium text-foreground">
            {t('disability')}
          </span>
        </label>
      </div>
    </Card>
  )
}
