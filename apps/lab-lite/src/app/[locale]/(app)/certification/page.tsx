'use client'

import { useTranslations } from 'next-intl'
import { Award } from '@ultranos/ui-kit/icons'
import { CertificationDashboard } from '@/components/certification/CertificationDashboard'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export default function CertificationPage() {
  const t = useTranslations('certification')
  const session = useAuthSessionStore((s) => s.session)

  const technicianId = session?.userId ?? 'unknown'
  const technicianName = session?.email?.split('@')[0] ?? t('technician')

  return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Award size={28} className="text-primary dark:text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {t('pageTitle')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('pageSubtitle')}
            </p>
          </div>
        </div>

        <CertificationDashboard
          technicianId={technicianId}
          technicianName={technicianName}
        />
      </div>
  )
}
