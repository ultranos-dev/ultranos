'use client'

import { useTranslations } from 'next-intl'
import { Trophy } from '@ultranos/ui-kit/icons'
import { AuthGuard } from '@/components/AuthGuard'
import { TeamAchievementDashboard } from '@/components/achievements/TeamAchievementDashboard'

export default function AchievementsPage() {
  const t = useTranslations('achievements')

  return (
    <AuthGuard>
      <div className="border-b border-border bg-background">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <Trophy size={24} className="text-primary" aria-hidden />
          <h1 className="text-lg font-semibold text-foreground">{t('teamAchievements')}</h1>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-6">
        <TeamAchievementDashboard />
      </main>
    </AuthGuard>
  )
}
