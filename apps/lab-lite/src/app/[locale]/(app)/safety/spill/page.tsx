'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { SpillTypeSelector } from '@/components/safety/SpillTypeSelector'
import { SpillResponseWorkflow } from '@/components/safety/SpillResponseWorkflow'
import { SpillHistoryView } from '@/components/safety/SpillHistoryView'
import type { SpillType } from '@/types/spill-protocol'

/**
 * Safety / Spill route — Story 47.5
 *
 * Entry point for the spill decontamination workflow. Also accessible from
 * the Story 47.1 emergency action menu via navigation to this route.
 *
 * States:
 *   idle     → shows SpillTypeSelector overlay + SpillHistoryView below
 *   workflow → full-screen SpillResponseWorkflow (renders over everything)
 */

export default function SpillPage() {
  const t = useTranslations()
  const [spillType, setSpillType] = useState<SpillType | null>(null)
  const [showSelector, setShowSelector] = useState(false)
  const [lastIncidentId, setLastIncidentId] = useState<string | null>(null)

  const handleWorkflowComplete = (incidentId: string) => {
    setLastIncidentId(incidentId)
    setSpillType(null)
  }

  return (
    <div
      style={{ padding: '1rem', maxWidth: '40rem', margin: '0 auto' }}
      dir="auto"
    >
      {/* Page header */}
      <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>
        {t('safety.spill.selector.title')}
      </h1>
      <p style={{ fontSize: '1rem', color: '#6b7280', marginBottom: '1.5rem' }}>
        {t('safety.spill.history.title')}
      </p>

      {/* Emergency CTA */}
      <button
        type="button"
        onClick={() => setShowSelector(true)}
        style={{
          backgroundColor: '#dc2626',
          color: 'white',
          border: 'none',
          borderRadius: '0.5rem',
          padding: '1rem 2rem',
          fontSize: '1.25rem',
          fontWeight: 700,
          cursor: 'pointer',
          minHeight: '64px',
          width: '100%',
          marginBottom: '2rem',
        }}
      >
        ⚠️ {t('safety.spill.selector.subtitle')}
      </button>

      {/* Past incident history */}
      <SpillHistoryView />

      {/* Spill type selector overlay */}
      {showSelector && !spillType && (
        <SpillTypeSelector
          onSelect={(type) => {
            setSpillType(type)
            setShowSelector(false)
          }}
          onClose={() => setShowSelector(false)}
        />
      )}

      {/* Full-screen workflow */}
      {spillType && (
        <SpillResponseWorkflow
          spillType={spillType}
          onClose={() => setSpillType(null)}
          onComplete={handleWorkflowComplete}
        />
      )}
    </div>
  )
}
