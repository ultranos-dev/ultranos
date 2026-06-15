'use client'

/**
 * AchievementBadge.tsx — Story 51.7: Gamified Team Quality Engagement
 *
 * Reusable badge component for individual and team achievements.
 * RTL-safe layout using logical CSS properties.
 */

import type { ReactNode } from 'react'
import {
  Trophy,
  CircleCheck,
  Zap,
  Target,
  Handshake,
  Star,
} from '@ultranos/ui-kit/icons'
import { AchievementType, type Achievement, type TeamAchievement } from '@/lib/db'

// ---------------------------------------------------------------------------
// Achievement display config
// ---------------------------------------------------------------------------

interface AchievementConfig {
  icon: ReactNode
  colorClass: string
  nameKey: string
}

const ACHIEVEMENT_CONFIG: Record<AchievementType, AchievementConfig> = {
  [AchievementType.QC_CHAMPION]: {
    icon: <Trophy size={20} aria-hidden="true" />,
    colorClass: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    nameKey: 'QC Champion',
  },
  [AchievementType.ZERO_REJECTION_WEEK]: {
    icon: <CircleCheck size={20} aria-hidden="true" />,
    colorClass: 'bg-green-50 border-green-200 text-green-800',
    nameKey: 'Zero Rejection Week',
  },
  [AchievementType.SPEED_STAR]: {
    icon: <Zap size={20} aria-hidden="true" />,
    colorClass: 'bg-blue-50 border-blue-200 text-blue-800',
    nameKey: 'Speed Star',
  },
  [AchievementType.CONSISTENCY_AWARD]: {
    icon: <Target size={20} aria-hidden="true" />,
    colorClass: 'bg-purple-50 border-purple-200 text-purple-800',
    nameKey: 'Consistency Award',
  },
  [AchievementType.MENTORSHIP_BADGE]: {
    icon: <Handshake size={20} aria-hidden="true" />,
    colorClass: 'bg-orange-50 border-orange-200 text-orange-800',
    nameKey: 'Mentorship Badge',
  },
  [AchievementType.TEAM_MILESTONE_1K]: {
    icon: <Star size={20} aria-hidden="true" />,
    colorClass: 'bg-indigo-50 border-indigo-200 text-indigo-800',
    nameKey: 'Team Milestone: 1,000 Tests',
  },
  [AchievementType.TEAM_MILESTONE_5K]: {
    icon: <Star size={20} aria-hidden="true" />,
    colorClass: 'bg-indigo-50 border-indigo-200 text-indigo-800',
    nameKey: 'Team Milestone: 5,000 Tests',
  },
  [AchievementType.TEAM_MILESTONE_10K]: {
    icon: <Star size={20} aria-hidden="true" />,
    colorClass: 'bg-indigo-50 border-indigo-200 text-indigo-800',
    nameKey: 'Team Milestone: 10,000 Tests',
  },
}

// ---------------------------------------------------------------------------
// Individual badge props
// ---------------------------------------------------------------------------

interface IndividualBadgeProps {
  achievement: Achievement
  techName?: string
  /** If true, hides the tech name (opted out of public display) */
  hideIdentity?: boolean
  /** Collaborative message prefix, e.g. "You earned" */
  messagePrefix?: string
}

export function AchievementBadge({
  achievement,
  techName,
  hideIdentity = false,
  messagePrefix = 'You earned',
}: IndividualBadgeProps) {
  const config = ACHIEVEMENT_CONFIG[achievement.type]
  const dateStr = new Date(achievement.earnedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const displayName = hideIdentity ? undefined : techName

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 ${config.colorClass}`}
      data-testid="achievement-badge"
      data-type={achievement.type}
    >
      {/* Icon */}
      <span className="shrink-0 mt-0.5">
        {config.icon}
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm leading-snug">{config.nameKey}</p>
        {displayName && (
          <p className="mt-0.5 text-xs opacity-80">
            {messagePrefix}: {displayName}
          </p>
        )}
        <p className="mt-0.5 text-xs opacity-70">{achievement.description}</p>
        <p className="mt-1 text-xs opacity-60">{dateStr}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Team badge props
// ---------------------------------------------------------------------------

interface TeamBadgeProps {
  achievement: TeamAchievement
}

export function TeamAchievementBadge({ achievement }: TeamBadgeProps) {
  const config = ACHIEVEMENT_CONFIG[achievement.type]
  const dateStr = new Date(achievement.earnedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 ${config.colorClass}`}
      data-testid="team-achievement-badge"
      data-type={achievement.type}
    >
      <span className="shrink-0 mt-0.5">
        {config.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm leading-snug">{config.nameKey}</p>
        <p className="mt-0.5 text-xs opacity-70">{achievement.description}</p>
        <p className="mt-1 text-xs opacity-60">{dateStr}</p>
      </div>
    </div>
  )
}
