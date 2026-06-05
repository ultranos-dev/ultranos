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
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-muted-foreground">{t('recentPatients')}</h3>
      <ul className="mt-2 divide-y divide-border/50" role="list">
        {patients.map((p) => (
          <li key={p.patientId}>
            <button
              type="button"
              onClick={() => onSelect(p)}
              className="flex w-full items-center justify-between py-2.5 text-start hover:bg-muted/30 rounded-md px-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
              <span className="text-sm font-medium text-foreground">{p.firstName}</span>
              <span className="text-xs text-muted-foreground">{t('yearsOld', { age: p.age })}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
