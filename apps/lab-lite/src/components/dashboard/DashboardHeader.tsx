'use client'

import { useTranslations } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export function DashboardHeader() {
  const t = useTranslations('dashboard')
  const session = useAuthSessionStore((s) => s.session)
  const displayName = session?.email?.split('@')[0] ?? t('defaultTechName')

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">
          {t('greeting', { name: displayName })}
        </h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          {(session as Record<string, unknown>)?.labName as string ?? t('defaultLabName')}
        </p>
      </div>
    </div>
  )
}
