'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
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

const RISK_COLORS: Record<RiskTier, { bg: string; text: string; border: string }> = {
  [RiskTier.LOW]:      { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  [RiskTier.MODERATE]: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  [RiskTier.HIGH]:     { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  [RiskTier.CRITICAL]: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
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

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        {t('safety.spill.history.loading')}
      </div>
    )
  }

  if (selected) {
    return (
      <SpillIncidentDetail
        incident={selected}
        onBack={() => setSelected(null)}
        t={t}
      />
    )
  }

  if (incidents.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        <p style={{ fontSize: '1.125rem', margin: 0 }}>{t('safety.spill.history.empty')}</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem' }} dir="auto">
      <h2
        style={{ fontSize: '1.375rem', fontWeight: 700, color: '#111827', marginBottom: '1rem' }}
      >
        {t('safety.spill.history.title')}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {incidents.map((incident) => {
          const riskColor = RISK_COLORS[incident.riskTier]
          const dateStr = new Date(incident.occurredAt).toLocaleDateString()
          const isComplete = incident.completedAt !== null

          return (
            <button
              key={incident.id}
              type="button"
              onClick={() => setSelected(incident)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                padding: '1rem',
                backgroundColor: 'white',
                border: `1px solid ${riskColor.border}`,
                borderInlineStart: `4px solid ${riskColor.text}`,
                borderRadius: '0.5rem',
                cursor: 'pointer',
                textAlign: 'start',
                minHeight: '56px',
                gap: '0.5rem',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>
                    {t(`safety.spill.types.${incident.spillType.toLowerCase().replace(/_/g, '')}` as any)}
                  </span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: riskColor.text,
                      backgroundColor: riskColor.bg,
                      padding: '0.125rem 0.5rem',
                      borderRadius: '9999px',
                    }}
                  >
                    {t(`safety.spill.riskTiers.${incident.riskTier.toLowerCase()}` as any)}
                  </span>
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  {incident.location} · {dateStr}
                </div>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: isComplete ? '#16a34a' : '#d97706',
                  backgroundColor: isComplete ? '#f0fdf4' : '#fffbeb',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '0.375rem',
                  flexShrink: 0,
                }}
              >
                {isComplete
                  ? t('safety.spill.history.completed')
                  : t('safety.spill.history.inProgress')}
              </span>
            </button>
          )
        })}
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
  const riskColor = RISK_COLORS[incident.riskTier]

  return (
    <div style={{ padding: '1rem' }} dir="auto">
      <button
        type="button"
        onClick={onBack}
        style={{
          backgroundColor: 'transparent',
          border: 'none',
          color: '#1d4ed8',
          fontSize: '1rem',
          cursor: 'pointer',
          padding: '0',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
        }}
      >
        ← {t('safety.spill.history.back')}
      </button>

      <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>
        {t(`safety.spill.types.${incident.spillType.toLowerCase().replace(/_/g, '')}` as any)}
      </h2>

      {/* Meta */}
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '0.5rem 1rem',
          marginBottom: '1.5rem',
          fontSize: '0.9375rem',
        }}
      >
        <dt style={{ color: '#6b7280', fontWeight: 600 }}>{t('safety.spill.history.riskTier')}</dt>
        <dd style={{ margin: 0 }}>
          <span
            style={{
              color: riskColor.text,
              backgroundColor: riskColor.bg,
              padding: '0.125rem 0.5rem',
              borderRadius: '9999px',
              fontWeight: 700,
              fontSize: '0.875rem',
              textTransform: 'uppercase',
            }}
          >
            {t(`safety.spill.riskTiers.${incident.riskTier.toLowerCase()}` as any)}
          </span>
        </dd>

        <dt style={{ color: '#6b7280', fontWeight: 600 }}>{t('safety.spill.history.location')}</dt>
        <dd style={{ margin: 0, color: '#111827' }}>{incident.location}</dd>

        <dt style={{ color: '#6b7280', fontWeight: 600 }}>{t('safety.spill.history.date')}</dt>
        <dd style={{ margin: 0, color: '#111827' }}>
          {new Date(incident.occurredAt).toLocaleString()}
        </dd>

        <dt style={{ color: '#6b7280', fontWeight: 600 }}>{t('safety.spill.history.status')}</dt>
        <dd style={{ margin: 0, color: incident.completedAt ? '#16a34a' : '#d97706', fontWeight: 600 }}>
          {incident.completedAt
            ? t('safety.spill.history.completed')
            : t('safety.spill.history.inProgress')}
        </dd>

        {incident.completedAt && (
          <>
            <dt style={{ color: '#6b7280', fontWeight: 600 }}>{t('safety.spill.history.completedAt')}</dt>
            <dd style={{ margin: 0, color: '#111827' }}>
              {new Date(incident.completedAt).toLocaleString()}
            </dd>
          </>
        )}

        {incident.notes && (
          <>
            <dt style={{ color: '#6b7280', fontWeight: 600 }}>{t('safety.spill.history.notes')}</dt>
            <dd style={{ margin: 0, color: '#111827' }}>{incident.notes}</dd>
          </>
        )}
      </dl>

      {/* Steps completed */}
      <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', marginBottom: '0.75rem' }}>
        {t('safety.spill.history.stepsCompleted', { count: incident.stepsCompleted.length })}
      </h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {incident.stepsCompleted.sort((a, b) => a - b).map((step) => (
          <span
            key={step}
            style={{
              backgroundColor: '#f0fdf4',
              color: '#16a34a',
              border: '1px solid #bbf7d0',
              borderRadius: '0.375rem',
              padding: '0.25rem 0.625rem',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            ✓ {t('safety.spill.history.stepN', { n: step })}
          </span>
        ))}
      </div>
    </div>
  )
}
