'use client'

import { useTranslations } from 'next-intl'
import { GraduationCap } from '@ultranos/ui-kit/icons'
import { CompetencyDashboard } from '@/components/competency/CompetencyDashboard'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export default function CompetencyPage() {
  const t = useTranslations('competency')
  const session = useAuthSessionStore((s) => s.session)

  const technicianId = session?.practitionerId ?? session?.userId ?? 'unknown'

  return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <GraduationCap size={28} className="text-primary dark:text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {t('pageTitle')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('pageSubtitle')}
            </p>
          </div>
        </div>

        <CompetencyDashboard technicianId={technicianId} />
      </div>
  )
}
