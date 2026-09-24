'use client'

import { useTranslations } from 'next-intl'

interface MergePreviewProps {
  survivorName: string
  duplicateName: string
  resolutions: Record<string, 'survivor' | 'duplicate'>
  fields: string[]
}

/** i18n key suffix for each mergeable patient field (patients.mergeField*). */
const FIELD_LABEL_KEY: Record<string, string> = {
  name_given: 'mergeFieldNameGiven',
  name_father: 'mergeFieldNameFather',
  name_grandfather: 'mergeFieldNameGrandfather',
  gender: 'mergeFieldGender',
  birth_year: 'mergeFieldBirthYear',
  address_district_origin: 'mergeFieldDistrictOrigin',
  address_province_origin: 'mergeFieldProvinceOrigin',
}

export function MergePreview({
  survivorName,
  duplicateName,
  resolutions,
  fields,
}: MergePreviewProps) {
  const t = useTranslations('patients')
  const fromSurvivor = fields.filter((f) => resolutions[f] === 'survivor')
  const fromDuplicate = fields.filter((f) => resolutions[f] === 'duplicate')
  const fieldsChanging = fromDuplicate

  return (
    <div className="space-y-4">
      {/* Warning banner */}
      <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4">
        <p className="text-sm font-semibold text-warning">{t('mergePreviewReversibleTitle')}</p>
        <p className="mt-1 text-xs text-warning/80">
          {t('mergePreviewReversibleDescription')}
        </p>
      </div>

      {/* Summary card */}
      <div className="rounded-xl bg-card p-5 border border-border">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          <span className="wavy-divider">{t('mergePreviewSummary')}</span>
        </h3>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('mergePreviewSurvivorKept')}</span>
            <span className="font-medium text-foreground">{survivorName}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('mergePreviewDuplicateDeactivated')}</span>
            <span className="font-medium text-foreground">{duplicateName}</span>
          </div>

          <div className="my-3 border-t border-border" />

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('mergePreviewFieldsFromSurvivor')}</span>
            <span className="font-medium text-foreground">{fromSurvivor.length}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('mergePreviewFieldsFromDuplicate')}</span>
            <span className="font-medium text-foreground">{fromDuplicate.length}</span>
          </div>
        </div>

        {/* Fields that will change */}
        {fieldsChanging.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('mergePreviewFieldsChanging')}</p>
            <ul className="mt-2 space-y-1">
              {fieldsChanging.map((field) => (
                <li key={field} className="flex items-center gap-2 text-sm text-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                  {FIELD_LABEL_KEY[field] ? t(FIELD_LABEL_KEY[field]) : field}
                </li>
              ))}
            </ul>
          </div>
        )}

        {fieldsChanging.length === 0 && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">{t('mergePreviewNoFieldsChanging')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
