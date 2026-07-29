'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { LabPermission } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useLabPermission } from '@/hooks/useLabPermission'
import {
  getCurrentWorkloads,
  reassignSample,
  type TechWorkload,
} from '@/lib/workload-service'
import { reportWorkloadAuditEvent } from '@/lib/audit-client'
import { TechWorkloadCard } from './TechWorkloadCard'
import { UnavailabilityToggle } from './UnavailabilityToggle'
import { WorkloadPatternsView } from './WorkloadPatterns'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 30_000  // 30-second polling per AC 1

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function WorkloadSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-busy="true"
      aria-label="Loading workload data…"
    >
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="h-44 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type Tab = 'dashboard' | 'patterns'

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorkloadDashboard() {
  const t = useTranslations('workload')
  const session = useAuthSessionStore((s) => s.session)
  const canView = useLabPermission(LabPermission.VIEW_STAFF)
  const canReassign = useLabPermission(LabPermission.MANAGE_STAFF_ROLES)

  const [workloads, setWorkloads] = useState<TechWorkload[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [refreshTick, setRefreshTick] = useState(0)

  const cancelledRef = useRef(false)
  const inFlightRef = useRef(false)

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchWorkloads = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const data = await getCurrentWorkloads()
      if (!cancelledRef.current) {
        setWorkloads(data)
        setError(null)
        setLoading(false)
      }
    } catch {
      if (!cancelledRef.current) {
        setError(t('errorLoadingWorkloads'))
        setLoading(false)
      }
    } finally {
      inFlightRef.current = false
    }
  }, [t])

  useEffect(() => {
    cancelledRef.current = false
    inFlightRef.current = false  // reset in case component was previously unmounted while in-flight
    fetchWorkloads()
    const interval = setInterval(fetchWorkloads, REFRESH_INTERVAL_MS)
    return () => {
      cancelledRef.current = true
      clearInterval(interval)
    }
  }, [fetchWorkloads, refreshTick])

  // ---------------------------------------------------------------------------
  // Drag-reassign handler
  // ---------------------------------------------------------------------------

  async function handleSampleReassign(
    sampleId: string,
    fromTechId: string,
    toTechId: string,
  ) {
    if (!canReassign) return
    const reassignedBy = session?.userId ?? 'unknown'
    try {
      await reassignSample(sampleId, fromTechId, toTechId, reassignedBy)
      void reportWorkloadAuditEvent({
        action: 'SAMPLE_REASSIGNED',
        sampleId,
        fromTechId,
        toTechId,
        reassignedBy,
      })
      // Trigger a refresh
      setRefreshTick((n) => n + 1)
    } catch {
      setError(t('errorReassigning'))
    }
  }

  // ---------------------------------------------------------------------------
  // Access control
  // ---------------------------------------------------------------------------

  if (!canView) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        {t('insufficientPermissions')}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Header + tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-foreground">{t('dashboard')}</h1>
        <div
          role="tablist"
          className="flex gap-1 rounded-lg border border-border bg-muted/30 p-0.5"
        >
          <TabButton
            id="tab-dashboard"
            panelId="panel-dashboard"
            active={activeTab === 'dashboard'}
            onClick={() => setActiveTab('dashboard')}
          >
            {t('dashboard')}
          </TabButton>
          <TabButton
            id="tab-patterns"
            panelId="panel-patterns"
            active={activeTab === 'patterns'}
            onClick={() => setActiveTab('patterns')}
          >
            {t('patterns')}
          </TabButton>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
          <button
            type="button"
            onClick={() => { setLoading(true); setRefreshTick((n) => n + 1) }}
            className="ms-2 underline"
          >
            {t('retry')}
          </button>
        </div>
      )}

      {/* Dashboard tab */}
      {activeTab === 'dashboard' && (
        <>
          {loading ? (
            <WorkloadSkeleton />
          ) : workloads.length === 0 ? (
            <div className="flex min-h-[16rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
              <EmptyState
                title={t('noAssignments')}
                description={t('noAssignmentsHint')}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {workloads.map((w) => (
                <TechWorkloadCard
                  key={w.techId}
                  workload={w}
                  techLabel={techLabelFor(w.techId)}
                  roleBadge={t('techRoleBadge')}
                  dragEnabled={canReassign}
                  onSampleDropped={(sampleId, fromTechId) => {
                    void handleSampleReassign(sampleId, fromTechId, w.techId)
                  }}
                  unavailabilityToggle={
                    <UnavailabilityToggle
                      techId={w.techId}
                      isCurrentlyUnavailable={w.isUnavailable}
                      currentReason={w.availabilityReason}
                      managerView={canReassign}
                      onChanged={() => setRefreshTick((n) => n + 1)}
                    />
                  }
                />
              ))}
            </div>
          )}
          {/* Legend */}
          {!loading && workloads.length > 0 && (
            <LoadLevelLegend t={t} />
          )}
        </>
      )}

      {/* Patterns tab */}
      {activeTab === 'patterns' && (
        <div className="rounded-lg border border-border bg-card p-4">
          <WorkloadPatternsView />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function TabButton({
  id,
  panelId,
  active,
  onClick,
  children,
}: {
  id: string
  panelId: string
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={panelId}
      aria-selected={active}
      onClick={onClick}
      className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
        active
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}


function LoadLevelLegend({ t }: { t: ReturnType<typeof useTranslations<'workload'>> }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span>{t('legend')}:</span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-green-400" />
        {t('normal')} (≤100%)
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-amber-400" />
        {t('elevated')} (101–150%)
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-red-400" />
        {t('overloaded')} (&gt;150%)
      </span>
    </div>
  )
}

/**
 * Derive a display-safe label from techId.
 * In production this would look up a name from the staff registry (Story 42.1).
 * Here we use the last 8 chars of the UUID — no PHI.
 */
function techLabelFor(techId: string): string {
  return `Tech …${techId.slice(-8)}`
}
