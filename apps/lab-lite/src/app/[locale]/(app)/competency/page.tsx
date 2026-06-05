'use client'

import { useTranslations } from 'next-intl'
import { GraduationCap } from '@ultranos/ui-kit/icons'
import { AuthGuard } from '@/components/AuthGuard'
import { CompetencyDashboard } from '@/components/competency/CompetencyDashboard'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export default function CompetencyPage() {
  const t = useTranslations('competency')
  const session = useAuthSessionStore((s) => s.session)

  const technicianId = session?.practitionerId ?? session?.userId ?? 'unknown'

  return (
    <AuthGuard>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <GraduationCap size={28} className="text-blue-600 dark:text-blue-400" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {t('pageTitle')}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('pageSubtitle')}
            </p>
          </div>
        </div>

        <CompetencyDashboard technicianId={technicianId} />
      </div>
    </AuthGuard>
  )
}
