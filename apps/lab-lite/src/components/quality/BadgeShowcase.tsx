'use client'

/**
 * Badge Showcase — Story 46.7
 *
 * Compact badge display for embedding in the settings/profile page.
 * Shows earned badges with icons and earned dates.
 * Designed to be a read-only, motivational display — no interactive elements.
 */

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ChevronRight } from '@ultranos/ui-kit/icons'
import type { EarnedBadge } from '@/lib/quality-streak-types'
import { getEarnedBadges, seedBadgeCatalogue } from '@/lib/badge-evaluator'
import { BADGE_BY_ID } from '@/lib/badge-definitions'
import { useAuthSessionStore } from '@/stores/auth-session-store'

// Icon map (same as QualityDashboard — inline to avoid coupling)
const ICON_MAP: Record<string, string> = {
  Flame: '🔥', Star: '⭐', Trophy: '🏆', Shield: '🛡️', ShieldCheck: '🛡️',
  BookOpen: '📖', GraduationCap: '🎓', Award: '🏅', Medal: '🥇',
  LineChart: '📈', CheckCircle: '✅', Gem: '💎', Certificate: '📜',
}

export function BadgeShowcase() {
  const t = useTranslations('quality')
  const session = useAuthSessionStore((s) => s.session)
  const technicianId = session?.userId ?? ''

  const [earnedBadges, setEarnedBadges] = useState<EarnedBadge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!technicianId) return
    seedBadgeCatalogue()
      .then(() => getEarnedBadges(technicianId))
      .then(setEarnedBadges)
      .finally(() => setLoading(false))
  }, [technicianId])

  if (loading) return null

  return (
    <section aria-labelledby="badge-showcase-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 id="badge-showcase-heading" className="text-sm font-semibold text-foreground">
          {t('badges.heading')}
        </h3>
        <Link
          href="/quality"
          className="flex items-center gap-1 text-xs text-primary hover:underline"
          aria-label={t('badges.viewAll')}
        >
          {t('badges.viewAll')} <ChevronRight size={12} aria-hidden />
        </Link>
      </div>

      {earnedBadges.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('badges.noneYet')}</p>
      ) : (
        <div className="flex flex-wrap gap-3" role="list" aria-label={t('badges.earned')}>
          {earnedBadges.slice(0, 8).map((earned) => {
            const badge = BADGE_BY_ID[earned.badgeId]
            if (!badge) return null
            return (
              <div
                key={earned.id}
                role="listitem"
                className="flex flex-col items-center gap-1 w-14 text-center"
                title={badge.description}
              >
                <span className="text-2xl" role="img" aria-label={badge.name}>
                  {ICON_MAP[badge.icon] ?? '⭐'}
                </span>
                <span className="text-xs text-muted-foreground leading-tight line-clamp-2">
                  {badge.name}
                </span>
              </div>
            )
          })}
          {earnedBadges.length > 8 && (
            <div className="flex flex-col items-center justify-center w-14">
              <span className="text-xs text-muted-foreground">+{earnedBadges.length - 8}</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
