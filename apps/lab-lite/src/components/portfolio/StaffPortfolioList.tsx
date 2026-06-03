'use client'

/**
 * Story 51.6 — Technician Performance Portfolio: StaffPortfolioList component
 * Task 3: Supervisor Portfolio View
 *
 * Lists techs in the supervisor's lab so they can view individual portfolios.
 * Gated to SUPERVISOR+ via `useLabPermission`.
 * No PHI — displays tech IDs and roles only.
 * RTL-safe.
 */

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronRight } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { LabRole } from '@ultranos/shared-types'
import { getDb } from '@/lib/db'

interface TechEntry {
  techId: string
  displayName: string
  role: string
}

interface StaffPortfolioListProps {
  onSelectTech: (techId: string, techName: string) => void
}

function canViewStaffPortfolios(role: string | undefined): boolean {
  return role === LabRole.SUPERVISOR || role === LabRole.LAB_MANAGER
}

export function StaffPortfolioList({ onSelectTech }: StaffPortfolioListProps) {
  const t = useTranslations('portfolio')
  const session = useAuthSessionStore((s) => s.session)
  const [techs, setTechs] = useState<TechEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!canViewStaffPortfolios(session?.labRole)) {
      setIsLoading(false)
      return
    }

    // Load available techs from Dexie (practitioner_keys or shift_sessions)
    async function loadTechs() {
      try {
        const db = getDb()
        // Use shift_sessions as a source of tech IDs (offline-available)
        const sessions = await db.shift_sessions.toArray().catch(() => [])
        const uniqueTechIds = [...new Set(sessions.map((s: any) => s.techId as string))]
        const currentTechId = session?.practitionerId
        // Exclude self — self-view is on the main portfolio page
        const otherTechs = uniqueTechIds.filter((id) => id !== currentTechId)
        setTechs(
          otherTechs.map((id) => ({
            techId: id,
            displayName: id.slice(0, 8) + '…', // opaque — no PHI names
            role: 'LAB_TECH',
          }))
        )
      } catch {
        setTechs([])
      } finally {
        setIsLoading(false)
      }
    }

    void loadTechs()
  }, [session])

  if (!canViewStaffPortfolios(session?.labRole)) {
    return null
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (techs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">{t('noStaffFound')}</p>
    )
  }

  return (
    <div className="space-y-2" data-testid="staff-portfolio-list">
      {techs.map((tech) => (
        <button
          key={tech.techId}
          onClick={() => onSelectTech(tech.techId, tech.displayName)}
          className="w-full flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted/50 transition-colors text-start"
          aria-label={`${t('viewPortfolio')} ${tech.displayName}`}
        >
          <div>
            <p className="text-sm font-medium text-foreground font-mono">{tech.displayName}</p>
            <p className="text-xs text-muted-foreground">{tech.role}</p>
          </div>
          <DirectionalIcon category="navigation">
            <ChevronRight size={16} className="text-muted-foreground" />
          </DirectionalIcon>
        </button>
      ))}
    </div>
  )
}
