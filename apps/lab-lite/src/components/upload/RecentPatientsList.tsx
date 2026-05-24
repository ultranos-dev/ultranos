'use client'

import { useTranslations } from 'next-intl'

interface VerifiedPatientCache {
  patientId: string
  firstName: string
  age: number
  verifiedAt: string
}

interface RecentPatientsListProps {
  patients: VerifiedPatientCache[]
  onSelect: (patient: VerifiedPatientCache) => void
}

export function RecentPatientsList({ patients, onSelect }: RecentPatientsListProps) {
  const t = useTranslations('verification')

  if (patients.length === 0) return null

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h3 className="text-sm font-medium text-neutral-500">{t('recentPatients')}</h3>
      <ul className="mt-2 divide-y divide-neutral-100" role="list">
        {patients.map((p) => (
          <li key={p.patientId}>
            <button
              type="button"
              onClick={() => onSelect(p)}
              className="flex w-full items-center justify-between py-2.5 text-start hover:bg-neutral-50 rounded-md px-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
              <span className="text-sm font-medium text-neutral-900">{p.firstName}</span>
              <span className="text-xs text-neutral-400">{t('yearsOld', { age: p.age })}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
