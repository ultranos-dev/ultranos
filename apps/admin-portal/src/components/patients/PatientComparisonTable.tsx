'use client'

import { FieldResolutionRow } from '@/components/patients/FieldResolutionRow'

const FIELD_LABELS: Record<string, string> = {
  name_given: 'Name Given',
  name_father: 'Name Father',
  name_grandfather: 'Name Grandfather',
  gender: 'Gender',
  birth_year: 'Birth Year',
  address_district_origin: 'District Origin',
  address_province_origin: 'Province Origin',
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
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-black">
          <tr>
            <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Field</th>
            <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Survivor Value</th>
            <th className="px-4 py-3 text-center font-medium text-white text-xs uppercase tracking-wide">Source</th>
            <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Duplicate Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-surface-raised">
          {fields.map((field) => (
            <FieldResolutionRow
              key={field}
              field={field}
              label={FIELD_LABELS[field] ?? field}
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
