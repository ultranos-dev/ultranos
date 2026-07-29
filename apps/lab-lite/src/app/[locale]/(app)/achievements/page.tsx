'use client'

import { TeamAchievementDashboard } from '@/components/achievements/TeamAchievementDashboard'

export default function AchievementsPage() {
  return (
      <div className="flex flex-col gap-4">
        <TeamAchievementDashboard />
      </div>
  )
}
