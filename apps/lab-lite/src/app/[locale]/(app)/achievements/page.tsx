'use client'

import { AuthGuard } from '@/components/AuthGuard'
import { TeamAchievementDashboard } from '@/components/achievements/TeamAchievementDashboard'

export default function AchievementsPage() {
  return (
    <AuthGuard>
      <div className="flex flex-col gap-4">
        <TeamAchievementDashboard />
      </div>
    </AuthGuard>
  )
}
