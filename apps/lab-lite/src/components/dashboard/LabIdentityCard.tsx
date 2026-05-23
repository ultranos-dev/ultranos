'use client'

import { useTranslations } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export function LabIdentityCard() {
  const t = useTranslations('dashboard')
  const session = useAuthSessionStore((s) => s.session)

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-medium text-neutral-500">{t('labIdentity')}</h2>
      <p className="mt-1 text-lg font-semibold text-neutral-900">
        {session?.labName ?? t('defaultLabName')}
      </p>
      <p className="mt-0.5 text-sm text-neutral-600">
        {session?.technicianName ?? t('defaultTechName')}
      </p>
    </div>
  )
}
