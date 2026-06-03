'use client'

/**
 * Story 51.6 — Technician Performance Portfolio: Portfolio Page Route
 *
 * /portfolio — self-view for authenticated lab techs.
 * Supervisors also see a staff list to navigate to other techs' portfolios.
 *
 * AC 3: All authenticated techs can view their own portfolio.
 * AC 4: SUPERVISOR+ can select other techs and view their portfolio.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { BarChart3, Users } from '@ultranos/ui-kit/icons'
import { AuthGuard } from '@/components/AuthGuard'
import { PortfolioDashboard } from '@/components/portfolio/PortfolioDashboard'
import { StaffPortfolioList } from '@/components/portfolio/StaffPortfolioList'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { LabRole } from '@ultranos/shared-types'

export default function PortfolioPage() {
  const t = useTranslations('portfolio')
  const session = useAuthSessionStore((s) => s.session)

  const [selectedTechId, setSelectedTechId] = useState<string | null>(null)
  const [selectedTechName, setSelectedTechName] = useState<string | null>(null)

  const isSupervisor =
    session?.labRole === LabRole.SUPERVISOR || session?.labRole === LabRole.LAB_MANAGER

  const handleSelectTech = (techId: string, techName: string) => {
    setSelectedTechId(techId)
    setSelectedTechName(techName)
  }

  const handleBackToSelf = () => {
    setSelectedTechId(null)
    setSelectedTechName(null)
  }

  return (
    <AuthGuard>
      {/* Page header */}
      <div className="border-b border-border bg-background">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <BarChart3 size={24} className="text-primary" aria-hidden />
          <h1 className="text-lg font-semibold text-foreground">{t('title')}</h1>
          {selectedTechId && (
            <>
              <span className="text-muted-foreground">/</span>
              <button
                onClick={handleBackToSelf}
                className="text-sm text-primary hover:underline"
                aria-label="Back to my portfolio"
              >
                {t('backToMyPortfolio') || 'Back to my portfolio'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex">
        {/* Sidebar: staff list for supervisors */}
        {isSupervisor && !selectedTechId && (
          <aside className="w-64 border-e border-border min-h-screen p-4 shrink-0">
            <div className="flex items-center gap-2 mb-4">
              <Users size={16} className="text-muted-foreground" aria-hidden />
              <h2 className="text-sm font-medium text-muted-foreground">Staff Portfolios</h2>
            </div>
            <StaffPortfolioList onSelectTech={handleSelectTech} />
          </aside>
        )}

        {/* Main content: portfolio dashboard */}
        <main className="flex-1 min-w-0">
          <PortfolioDashboard
            targetTechId={selectedTechId ?? undefined}
            targetTechName={selectedTechName ?? undefined}
          />
        </main>
      </div>
    </AuthGuard>
  )
}
