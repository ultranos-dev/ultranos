'use client'

/**
 * Story 54.6 — Seasonal Operations Planner Page
 *
 * Role-gated: lab_manager and lab_supervisor only.
 * Generates 30-day operational plans covering power, reagents, staffing, and protocols.
 *
 * NO PHI — all data displayed is aggregate statistics (test counts, reagent quantities,
 * operational metrics). Patient identifiers never appear in this view.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Calendar, RefreshCw } from '@ultranos/ui-kit/icons'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { LabRole } from '@ultranos/shared-types'
import { analyzeHistoricalDemand, detectUpcomingSurge } from '@/lib/demand-analyzer'
import { generateSeasonalPlan } from '@/lib/seasonal-forecast'
import { calculateDeadlines } from '@/lib/deadline-calculator'
import { getAllPatterns, getActivePlan, putSeasonalPattern, putSeasonalPlan } from '@/lib/db'
import { reportPlannerEvent } from '@/lib/audit-client'
import { PowerForecastPanel } from '@/components/planner/PowerForecastPanel'
import { ReagentForecastPanel } from '@/components/planner/ReagentForecastPanel'
import { StaffingForecastPanel } from '@/components/planner/StaffingForecastPanel'
import { ProtocolRecommendationsPanel } from '@/components/planner/ProtocolRecommendationsPanel'
import { DeadlinesPanel } from '@/components/planner/DeadlinesPanel'
import type { SeasonalPlan } from '@/types/seasonal-planner'

type Tab = 'power' | 'reagents' | 'staffing' | 'protocols'

const TABS: { id: Tab; label: string }[] = [
  { id: 'power', label: 'Power' },
  { id: 'reagents', label: 'Reagents' },
  { id: 'staffing', label: 'Staffing' },
  { id: 'protocols', label: 'Protocols' },
]

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center" role="alert">
      <p className="text-lg font-semibold text-foreground">Access Restricted</p>
      <p className="mt-2 text-sm text-muted-foreground">
        The Seasonal Operations Planner is only available to Lab Managers and Supervisors.
      </p>
    </div>
  )
}

function PlanSummaryCard({ plan }: { plan: SeasonalPlan }) {
  const statusColor = {
    draft: 'bg-amber-100 text-amber-700',
    finalized: 'bg-green-100 text-green-700',
    exported: 'bg-blue-100 text-blue-700',
  }[plan.status]

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-center gap-4 justify-between">
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">Active Plan</p>
        <p className="text-sm font-semibold text-foreground">
          {plan.planPeriod.start} → {plan.planPeriod.end}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Generated {new Date(plan.meta.lastUpdated).toLocaleDateString()}
          {' · '}Confidence:{' '}
          <span className="capitalize">{plan._ultranos.dataConfidence}</span>
        </p>
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${statusColor}`}>
        {plan.status}
      </span>
    </div>
  )
}

export default function SeasonalPlannerPage() {
  const session = useAuthSessionStore((s) => s.session)
  const allowedRoles: (LabRole | null)[] = [LabRole.LAB_MANAGER, LabRole.SUPERVISOR]
  const hasAccess = session?.labRole != null && allowedRoles.includes(session.labRole as LabRole)

  const [activeTab, setActiveTab] = useState<Tab>('power')
  const [plan, setPlan] = useState<SeasonalPlan | null>(null)
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load existing plan on mount
  useEffect(() => {
    if (!hasAccess) return
    let active = true
    async function load() {
      try {
        const existing = await getActivePlan()
        if (active) setPlan(existing ?? null)
      } catch {
        // No plan yet — first visit
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [hasAccess])

  const handleGeneratePlan = useCallback(async () => {
    if (!session) return
    setGenerating(true)
    setError(null)
    try {
      // Analyze historical demand (integrates with HMIS if available)
      const patterns = await analyzeHistoricalDemand()

      // Persist patterns for dashboard badge checks
      for (const p of patterns) {
        await putSeasonalPattern(p)
      }

      // Detect upcoming surges within 30 days
      const surgeAlerts = detectUpcomingSurge(patterns)

      // Generate the full 30-day plan
      const newPlan = await generateSeasonalPlan(
        patterns,
        surgeAlerts,
        session.userId,
      )

      // Attach deadlines
      const deadlines = calculateDeadlines(newPlan)
      const planWithDeadlines: SeasonalPlan = { ...newPlan, deadlines }

      // Persist to Dexie
      await putSeasonalPlan(planWithDeadlines)

      // Emit audit event
      reportPlannerEvent({
        action: 'SEASONAL_PLAN_GENERATED',
        planId: planWithDeadlines.id,
        actorId: session.userId,
      })

      setPlan(planWithDeadlines)
    } catch (err) {
      setError('Failed to generate plan. Please try again.')
      console.error('[SeasonalPlanner] generation failed:', err)
    } finally {
      setGenerating(false)
    }
  }, [session])

  const handleFinalizePlan = useCallback(async () => {
    if (!plan || !session) return
    const finalized: SeasonalPlan = {
      ...plan,
      status: 'finalized',
      meta: { ...plan.meta, lastUpdated: new Date().toISOString() },
    }
    await putSeasonalPlan(finalized)
    reportPlannerEvent({ action: 'SEASONAL_PLAN_FINALIZED', planId: plan.id, actorId: session.userId })
    setPlan(finalized)
  }, [plan, session])

  const handleExportPdf = useCallback(async () => {
    if (!plan || !session) return
    try {
      const { renderPlanPDF } = await import('@/lib/plan-pdf')
      const blob = await renderPlanPDF(plan)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `seasonal-plan-${plan.planPeriod.start}.pdf`
      a.click()
      URL.revokeObjectURL(url)

      const exported: SeasonalPlan = {
        ...plan,
        status: 'exported',
        meta: { ...plan.meta, lastUpdated: new Date().toISOString() },
      }
      await putSeasonalPlan(exported)
      reportPlannerEvent({ action: 'SEASONAL_PLAN_EXPORTED', planId: plan.id, actorId: session.userId })
      setPlan(exported)
    } catch (err) {
      setError('PDF export failed. Please try again.')
      console.error('[SeasonalPlanner] export failed:', err)
    }
  }, [plan, session])

  const handleDeadlineActioned = useCallback(async (deadlineId: string, notes: string) => {
    if (!plan || !session) return
    const updatedDeadlines = plan.deadlines.map((d) =>
      d.id === deadlineId
        ? { ...d, actionedAt: new Date().toISOString().slice(0, 10), actionedNotes: notes }
        : d,
    )
    const updated: SeasonalPlan = { ...plan, deadlines: updatedDeadlines }
    await putSeasonalPlan(updated)
    reportPlannerEvent({
      action: 'SEASONAL_DEADLINE_ACTIONED',
      planId: plan.id,
      actorId: session.userId,
      deadlineId,
    })
    setPlan(updated)
  }, [plan, session])

  if (!hasAccess) return <AccessDenied />

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw size={20} className="animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="ms-2 text-sm text-muted-foreground">Loading planner…</span>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar size={20} className="text-blue-500" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-foreground">Seasonal Operations Planner</h1>
        </div>
        <div className="flex gap-2">
          {plan && plan.status === 'draft' && (
            <button
              onClick={handleFinalizePlan}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/30"
            >
              Finalize Plan
            </button>
          )}
          {plan && (
            <button
              onClick={handleExportPdf}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/30"
            >
              Export PDF
            </button>
          )}
          <button
            onClick={handleGeneratePlan}
            disabled={generating}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {generating && <RefreshCw size={14} className="animate-spin" aria-hidden="true" />}
            {generating ? 'Generating…' : 'Generate New Plan'}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Active plan summary */}
      {plan && <PlanSummaryCard plan={plan} />}

      {!plan && !generating && (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
          <Calendar size={32} className="mx-auto text-muted-foreground mb-3" aria-hidden="true" />
          <p className="text-sm text-muted-foreground font-medium">No seasonal plan generated yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Click "Generate New Plan" to analyze historical demand and create a 30-day operational plan.
          </p>
        </div>
      )}

      {plan && (
        <div className="space-y-4">
          {/* Deadlines section — always visible */}
          <DeadlinesPanel deadlines={plan.deadlines} onAction={handleDeadlineActioned} />

          {/* Domain tabs */}
          <div>
            <div className="flex border-b border-border" role="tablist">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mt-4" role="tabpanel">
              {activeTab === 'power' && <PowerForecastPanel forecast={plan.powerForecast} />}
              {activeTab === 'reagents' && <ReagentForecastPanel forecast={plan.reagentForecast} />}
              {activeTab === 'staffing' && <StaffingForecastPanel forecast={plan.staffingForecast} />}
              {activeTab === 'protocols' && (
                <ProtocolRecommendationsPanel recommendations={plan.protocolRecommendations} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
