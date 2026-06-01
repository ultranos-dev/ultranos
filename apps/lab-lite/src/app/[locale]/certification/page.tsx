'use client'

import { useTranslations } from 'next-intl'
import { Award } from '@ultranos/ui-kit/icons'
import { AuthGuard } from '@/components/AuthGuard'
import { CertificationDashboard } from '@/components/certification/CertificationDashboard'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export default function CertificationPage() {
  const t = useTranslations('certification')
  const session = useAuthSessionStore((s) => s.session)

  const technicianId = session?.userId ?? 'unknown'
  const technicianName = session?.email?.split('@')[0] ?? t('technician')

  return (
    <AuthGuard>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Award size={28} className="text-blue-600 dark:text-blue-400" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {t('pageTitle')}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('pageSubtitle')}
            </p>
          </div>
        </div>

        <CertificationDashboard
          technicianId={technicianId}
          technicianName={technicianName}
        />
      </div>
    </AuthGuard>
  )
}
