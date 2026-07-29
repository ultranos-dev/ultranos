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
    <div className="flex flex-col gap-4" dir="auto">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">
          {t('safety.spill.selector.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('safety.spill.history.title')}
        </p>
      </div>

      {/* Emergency CTA — red prominence retained via the destructive token */}
      <button
        type="button"
        onClick={() => setShowSelector(true)}
        className="flex min-h-[64px] w-full items-center justify-center gap-2 rounded-xl bg-destructive px-8 py-4 text-xl font-bold text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
