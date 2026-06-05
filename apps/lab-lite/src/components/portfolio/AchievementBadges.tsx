'use client'

/**
 * AchievementBadges.tsx — Story 51.7: Gamified Team Quality Engagement
 * (Placeholder referenced in Story 51.6 — implemented here)
 *
 * Portfolio section showing all earned achievement badges for a tech.
 * Badges are cumulative (not reset) and included in portfolio export.
 * No PHI — displays tech's own achievement data only.
 */

import { useEffect, useState } from 'react'
import type { Achievement } from '@/lib/db'
import { getAchievementsForTech } from '@/lib/achievement-service'
import { AchievementBadge } from '@/components/achievements/AchievementBadge'

interface AchievementBadgesProps {
  techId: string
  /** If true, renders in a compact export-friendly layout */
  exportMode?: boolean
}

export function AchievementBadges({ techId, exportMode = false }: AchievementBadgesProps) {
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    let active = true
    getAchievementsForTech(techId)
      .then((list) => {
        if (active) {
          // Sort: newest first
          const sorted = [...list].sort((a, b) => b.earnedAt.localeCompare(a.earnedAt))
          setAchievements(sorted)
          setIsLoaded(true)
        }
      })
      .catch(() => {
        if (active) setIsLoaded(true)
      })
    return () => { active = false }
  }, [techId])

  if (!isLoaded) {
    return <p className="text-sm text-muted-foreground">Loading badges…</p>
  }

  if (achievements.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic" data-testid="no-achievements">
        No achievement badges yet.
      </p>
    )
  }

  return (
    <div
      className={exportMode ? 'space-y-2' : 'grid gap-2 sm:grid-cols-2'}
      data-testid="achievement-badges-list"
    >
      {achievements.map((a) => (
        <AchievementBadge key={a.id} achievement={a} messagePrefix="Earned" />
      ))}
    </div>
  )
}
