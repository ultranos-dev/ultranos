'use client'

import { useTranslations } from 'next-intl'
import { FieldResolutionRow } from '@/components/patients/FieldResolutionRow'

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

interface PatientComparisonTableProps {
  survivor: Record<string, unknown>
  duplicate: Record<string, unknown>
  fields: string[]
  resolutions: Record<string, 'survivor' | 'duplicate'>
  onResolve: (field: string, source: 'survivor' | 'duplicate') => void
}

export function PatientComparisonTable({
  survivor,
  duplicate,
  fields,
  resolutions,
  onResolve,
}: PatientComparisonTableProps) {
  const t = useTranslations('patients')
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('mergeColField')}</th>
            <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('mergeColSurvivorValue')}</th>
            <th className="px-4 py-3 text-center font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('mergeColSource')}</th>
            <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('mergeColDuplicateValue')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {fields.map((field) => (
            <FieldResolutionRow
              key={field}
              field={field}
              label={FIELD_LABEL_KEY[field] ? t(FIELD_LABEL_KEY[field]) : field}
              survivorValue={survivor[field]}
              duplicateValue={duplicate[field]}
              resolution={resolutions[field]}
              onResolve={(source) => onResolve(field, source)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
