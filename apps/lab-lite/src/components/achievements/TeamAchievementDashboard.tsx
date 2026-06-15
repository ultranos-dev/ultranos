'use client'

/**
 * TeamAchievementDashboard.tsx — Story 51.7: Gamified Team Quality Engagement
 *
 * Displays team achievements, active streaks, and milestone progress.
 * Only visible when lab manager has enabled gamification.
 * Collaborative language throughout — no competitive leaderboard.
 *
 * AC 2: Team Dashboard (Opt-In)
 * AC 3: Collaborative Framing
 */

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getDb, AchievementType } from '@/lib/db'
import type { Achievement, TeamAchievement, AchievementPreferences } from '@/lib/db'
import {
  getAchievementsForTech,
  getTeamAchievementsRecent,
  getActiveStreaks,
  type Streak,
} from '@/lib/achievement-service'
import { getAchievementSchedulerConfig, getAchievementPreferences } from '@/lib/db'
import { AchievementBadge, TeamAchievementBadge } from './AchievementBadge'
import { StreakProgress } from './StreakProgress'
import { useAuthSessionStore } from '@/stores/auth-session-store'

// ---------------------------------------------------------------------------
// Milestone progress display
// ---------------------------------------------------------------------------

const MILESTONE_THRESHOLDS: Array<{ type: AchievementType; count: number; label: string }> = [
  { type: AchievementType.TEAM_MILESTONE_1K, count: 1000, label: '1,000 tests' },
  { type: AchievementType.TEAM_MILESTONE_5K, count: 5000, label: '5,000 tests' },
  { type: AchievementType.TEAM_MILESTONE_10K, count: 10000, label: '10,000 tests' },
]

function MilestoneProgressBar({
  label,
  current,
  target,
  earned,
}: {
  label: string
  current: number
  target: number
  earned: boolean
}) {
  const pct = Math.min((current / target) * 100, 100)
  return (
    <div className="space-y-1.5" data-testid="milestone-progress-bar">
      <div className="flex items-center justify-between text-sm">
        <span className={`font-medium ${earned ? 'text-indigo-700' : 'text-foreground'}`}>
          {label}
          {earned && <span className="ms-2 text-xs text-indigo-500">✓ Earned!</span>}
        </span>
        <span className="text-xs text-muted-foreground">
          {current.toLocaleString()} / {target.toLocaleString()}
        </span>
      </div>
      <div
        className="h-2 w-full rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={`${label}: ${current} of ${target}`}
      >
        <div
          className={`h-full rounded-full transition-all ${earned ? 'bg-indigo-500' : 'bg-indigo-300'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

export function TeamAchievementDashboard() {
  const t = useTranslations('achievements')
  const session = useAuthSessionStore((s) => s.session)
  const [gamificationEnabled, setGamificationEnabled] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  // Current month individual achievements (current tech)
  const [myAchievements, setMyAchievements] = useState<Achievement[]>([])
  const [myPrefs, setMyPrefs] = useState<AchievementPreferences | null>(null)

  // Team achievements (last 3 months)
  const [teamAchievements, setTeamAchievements] = useState<TeamAchievement[]>([])

  // Active streaks
  const [streaks, setStreaks] = useState<Streak[]>([])

  // Total tests for milestone bars
  const [totalTests, setTotalTests] = useState(0)
  const [earnedMilestones, setEarnedMilestones] = useState<Set<AchievementType>>(new Set())

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const config = await getAchievementSchedulerConfig()
        if (!active) return
        setGamificationEnabled(config.gamificationEnabled)

        if (!config.gamificationEnabled) {
          setIsLoaded(true)
          return
        }

        const db = getDb()
        const [myAch, teamAch, activeStreaks, testCount] = await Promise.all([
          session?.practitionerId
            ? getAchievementsForTech(session.practitionerId)
            : Promise.resolve([]),
          getTeamAchievementsRecent(3),
          getActiveStreaks(),
          db.lab_results.count().catch(() => 0),
        ])

        const prefs = session?.practitionerId
          ? await getAchievementPreferences(session.practitionerId)
          : null

        // Which milestones are already earned?
        const earned = new Set<AchievementType>()
        for (const ta of teamAch) {
          if (
            ta.type === AchievementType.TEAM_MILESTONE_1K ||
            ta.type === AchievementType.TEAM_MILESTONE_5K ||
            ta.type === AchievementType.TEAM_MILESTONE_10K
          ) {
            earned.add(ta.type)
          }
        }

        if (!active) return
        setMyAchievements(myAch)
        setMyPrefs(prefs)
        setTeamAchievements(teamAch)
        setStreaks(activeStreaks)
        setTotalTests(testCount)
        setEarnedMilestones(earned)
        setIsLoaded(true)
      } catch {
        if (active) setIsLoaded(true)
      }
    }

    void load()
    return () => { active = false }
  }, [session?.practitionerId])

  if (!isLoaded) {
    return (
      <div className="p-4 text-sm text-muted-foreground" data-testid="achievement-dashboard-loading">
        Loading achievements…
      </div>
    )
  }

  if (!gamificationEnabled) {
    return null
  }

  // Monthly awards are stamped with the previous month by the scheduler.
  // Show achievements from the last two months and lifetime badges.
  const currentMonth = new Date().toISOString().slice(0, 7)
  const prevMonthDate = new Date()
  prevMonthDate.setDate(1)
  prevMonthDate.setMonth(prevMonthDate.getMonth() - 1)
  const prevMonth = prevMonthDate.toISOString().slice(0, 7)

  const thisMonthAchievements = myAchievements.filter(
    (a) =>
      a.evaluationPeriod === currentMonth ||
      a.evaluationPeriod === prevMonth ||
      a.evaluationPeriod === 'lifetime',
  )
  const recentTeamAchievements = teamAchievements.slice(0, 10)
  const hideMyName = myPrefs?.showOnTeamDashboard === false

  return (
    <div className="space-y-4" data-testid="team-achievement-dashboard">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('teamAchievements')}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('subtitle')}
        </p>
      </div>

      {/* Active Streaks */}
      {streaks.length > 0 && (
        <section aria-label={t('activeStreaks')}>
          <h3 className="text-sm font-semibold text-foreground mb-3">{t('activeStreaks')}</h3>
          <div className="space-y-3">
            {streaks.map((streak) => (
              <StreakProgress key={streak.type} streak={streak} />
            ))}
          </div>
        </section>
      )}

      {/* My Achievements This Month */}
      {thisMonthAchievements.length > 0 && (
        <section aria-label={t('myAchievementsThisMonth')}>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            {t('myAchievementsThisMonth')}
          </h3>
          <div className="space-y-2">
            {thisMonthAchievements.map((a) => (
              <AchievementBadge
                key={a.id}
                achievement={a}
                hideIdentity={hideMyName}
                messagePrefix={t('youEarned')}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recent Team Achievements */}
      {recentTeamAchievements.length > 0 && (
        <section aria-label={t('recentTeamAchievements')}>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            {t('recentTeamAchievements')}
          </h3>
          <div className="space-y-2">
            {recentTeamAchievements.map((a) => (
              <TeamAchievementBadge key={a.id} achievement={a} />
            ))}
          </div>
        </section>
      )}

      {/* Team Milestones Progress */}
      <section aria-label={t('teamMilestones')}>
        <h3 className="text-sm font-semibold text-foreground mb-3">{t('teamMilestones')}</h3>
        <div className="space-y-4">
          {MILESTONE_THRESHOLDS.map((m) => (
            <MilestoneProgressBar
              key={m.type}
              label={m.label}
              current={totalTests}
              target={m.count}
              earned={earnedMilestones.has(m.type)}
            />
          ))}
        </div>
      </section>

      {/* Empty state */}
      {thisMonthAchievements.length === 0 &&
        recentTeamAchievements.length === 0 &&
        streaks.length === 0 && (
          <div className="rounded-lg border border-border bg-muted/30 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {t('noAchievementsYet')}
            </p>
          </div>
        )}
    </div>
  )
}
