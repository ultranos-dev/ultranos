'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Droplets } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import { getAllSpillIncidents } from '@/lib/safety/spill-service'
import { RiskTier } from '@/types/spill-protocol'
import type { SpillIncident } from '@/types/spill-protocol'

/**
 * SpillHistoryView — Story 47.5
 *
 * Lists all past spill incidents. Tap an incident to view its details.
 * Feeds into inspection readiness documentation (Story 47.7 integration).
 *
 * No PHI: displays spillType, riskTier, location, date, completion status only.
 */

// Risk-tier prominence via semantic tokens. CRITICAL stays red (destructive);
// HIGH/MODERATE keep warning (amber) prominence; LOW is a calm muted/primary tone.
const RISK_TIER_CLASSES: Record<RiskTier, { badge: string; accent: string; border: string }> = {
  [RiskTier.LOW]: {
    badge: 'bg-primary/10 text-primary',
    accent: 'border-s-primary',
    border: 'ring-primary/30',
  },
  [RiskTier.MODERATE]: {
    badge: 'bg-warning/10 text-warning',
    accent: 'border-s-warning',
    border: 'ring-warning/30',
  },
  [RiskTier.HIGH]: {
    badge: 'bg-warning/15 text-warning',
    accent: 'border-s-warning',
    border: 'ring-warning/40',
  },
  [RiskTier.CRITICAL]: {
    badge: 'bg-destructive/10 text-destructive',
    accent: 'border-s-destructive',
    border: 'ring-destructive/40',
  },
}

export function SpillHistoryView() {
  const t = useTranslations()
  const [incidents, setIncidents] = useState<SpillIncident[]>([])
  const [selected, setSelected] = useState<SpillIncident | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void getAllSpillIncidents()
      .then(setIncidents)
      .finally(() => setLoading(false))
  }, [])

  if (selected) {
    return (
      <SpillIncidentDetail
        incident={selected}
        onBack={() => setSelected(null)}
        t={t}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4" dir="auto">
      <h2 className="text-2xl font-semibold text-foreground">
        {t('safety.spill.history.title')}
      </h2>

      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground" aria-busy="true">
            {t('safety.spill.history.loading')}
          </div>
        ) : incidents.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={Droplets} title={t('safety.spill.history.empty')} />
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-3">
            {incidents.map((incident) => {
              const risk = RISK_TIER_CLASSES[incident.riskTier]
              const dateStr = new Date(incident.occurredAt).toLocaleDateString()
              const isComplete = incident.completedAt !== null

              return (
                <button
                  key={incident.id}
                  type="button"
                  onClick={() => setSelected(incident)}
                  className={`flex min-h-[56px] items-start justify-between gap-2 rounded-lg border-s-4 bg-card p-4 text-start shadow-card ring-[0.65px] transition-colors hover:bg-muted/50 ${risk.accent} ${risk.border}`}
                >
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-foreground">
                        {t(`safety.spill.types.${incident.spillType.toLowerCase().replace(/_/g, '')}` as any)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${risk.badge}`}>
                        {t(`safety.spill.riskTiers.${incident.riskTier.toLowerCase()}` as any)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {incident.location} · {dateStr}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${
                      isComplete ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                    }`}
                  >
                    {isComplete
                      ? t('safety.spill.history.completed')
                      : t('safety.spill.history.inProgress')}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Incident detail view
// ---------------------------------------------------------------------------

interface SpillIncidentDetailProps {
  incident: SpillIncident
  onBack: () => void
  t: ReturnType<typeof useTranslations>
}

function SpillIncidentDetail({ incident, onBack, t }: SpillIncidentDetailProps) {
  const risk = RISK_TIER_CLASSES[incident.riskTier]

  return (
    <div className="flex flex-col gap-4" dir="auto">
      <Button variant="ghost" size="sm" className="w-fit px-0" onClick={onBack}>
        ← {t('safety.spill.history.back')}
      </Button>

      <h2 className="text-2xl font-semibold text-foreground">
        {t(`safety.spill.types.${incident.spillType.toLowerCase().replace(/_/g, '')}` as any)}
      </h2>

      {/* Meta */}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-card p-5 text-[0.9375rem] shadow-card ring-[0.65px] ring-border/50">
        <dt className="font-semibold text-muted-foreground">{t('safety.spill.history.riskTier')}</dt>
        <dd className="m-0">
          <span className={`rounded-full px-2 py-0.5 text-sm font-bold uppercase ${risk.badge}`}>
            {t(`safety.spill.riskTiers.${incident.riskTier.toLowerCase()}` as any)}
          </span>
        </dd>

        <dt className="font-semibold text-muted-foreground">{t('safety.spill.history.location')}</dt>
        <dd className="m-0 text-foreground">{incident.location}</dd>

        <dt className="font-semibold text-muted-foreground">{t('safety.spill.history.date')}</dt>
        <dd className="m-0 text-foreground">
          {new Date(incident.occurredAt).toLocaleString()}
        </dd>

        <dt className="font-semibold text-muted-foreground">{t('safety.spill.history.status')}</dt>
        <dd className={`m-0 font-semibold ${incident.completedAt ? 'text-success' : 'text-warning'}`}>
          {incident.completedAt
            ? t('safety.spill.history.completed')
            : t('safety.spill.history.inProgress')}
        </dd>

        {incident.completedAt && (
          <>
            <dt className="font-semibold text-muted-foreground">{t('safety.spill.history.completedAt')}</dt>
            <dd className="m-0 text-foreground">
              {new Date(incident.completedAt).toLocaleString()}
            </dd>
          </>
        )}

        {incident.notes && (
          <>
            <dt className="font-semibold text-muted-foreground">{t('safety.spill.history.notes')}</dt>
            <dd className="m-0 text-foreground">{incident.notes}</dd>
          </>
        )}
      </dl>

      {/* Steps completed */}
      <h3 className="text-lg font-bold text-foreground">
        {t('safety.spill.history.stepsCompleted', { count: incident.stepsCompleted.length })}
      </h3>
      <div className="flex flex-wrap gap-2">
        {incident.stepsCompleted.slice().sort((a, b) => a - b).map((step) => (
          <span
            key={step}
            className="rounded-md border border-success/30 bg-success/10 px-2.5 py-1 text-sm font-semibold text-success"
          >
            ✓ {t('safety.spill.history.stepN', { n: step })}
          </span>
        ))}
      </div>
    </div>
  )
}
