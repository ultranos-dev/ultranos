'use client'

/**
 * Story 52.2 — Shared Inventory Visibility: Redistribution Panel
 *
 * Displays redistribution recommendations as actionable cards:
 * - Source lab, destination lab, reagent, suggested quantity, distance
 * - "Initiate Transfer" button (creates a transfer request flag — future workflow)
 * - "Dismiss" button (hides recommendation for 7 days)
 *
 * Filtering:
 *   - Lab technicians / managers: only recommendations where they are source or destination.
 *   - Network-admin role (LabRole.NETWORK_ADMIN): all recommendations across district.
 *
 * RTL-ready: logical CSS properties only.
 * No PHI: facility names and reagent operational data only.
 */

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowRight, X, Send } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import type { RedistributionRecommendation } from '@/lib/db'
import {
  getLabRecommendations,
  getAllRecommendations,
  dismissRecommendation,
} from '@/lib/inventory/redistribution-engine'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  myLabId: string
  isNetworkAdmin?: boolean
}

export function RedistributionPanel({ myLabId, isNetworkAdmin = false }: Props) {
  const t = useTranslations('inventory')

  const [recommendations, setRecommendations] = useState<RedistributionRecommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [transferFlagged, setTransferFlagged] = useState<Set<number>>(new Set())

  const loadRecommendations = useCallback(async () => {
    setLoading(true)
    try {
      const recs = isNetworkAdmin
        ? await getAllRecommendations()
        : await getLabRecommendations(myLabId)
      setRecommendations(recs)
    } finally {
      setLoading(false)
    }
  }, [myLabId, isNetworkAdmin])

  useEffect(() => {
    loadRecommendations()
  }, [loadRecommendations])

  const handleDismiss = useCallback(
    async (id: number) => {
      if (id === undefined) return
      await dismissRecommendation(id)
      setRecommendations(prev => prev.filter(r => r.id !== id))
    },
    [],
  )

  const handleInitiateTransfer = useCallback((id: number) => {
    // Future workflow: will create a TransferRequest in the Hub.
    // For now: flag locally so the UI shows the action was taken.
    setTransferFlagged(prev => new Set(prev).add(id))
  }, [])

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2].map(i => (
          <div key={i} className="h-24 rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  if (recommendations.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-8 py-10 text-center text-sm text-muted-foreground">
        {t('noRedistributionRecommendations')}
      </div>
    )
  }

  return (
    <div className="space-y-3" role="list" aria-label={t('redistributionRecommendations')}>
      {recommendations.map(rec => {
        const id = rec.id!
        const isFlagged = transferFlagged.has(id)
        const isDeficit = rec.deficitLabId === myLabId
        const isSource = rec.sourceLabId === myLabId

        return (
          <div
            key={id}
            role="listitem"
            className="relative rounded-lg border border-orange-200 bg-orange-50 p-4"
          >
            {/* Dismiss button */}
            <button
              type="button"
              onClick={() => handleDismiss(id)}
              className="absolute end-3 top-3 rounded p-1 text-muted-foreground hover:text-muted-foreground"
              aria-label={t('dismiss')}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>

            {/* Role badge */}
            {(isDeficit || isSource) && (
              <span
                className={`mb-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  isDeficit
                    ? 'bg-red-100 text-red-700'
                    : 'bg-primary/10 text-primary'
                }`}
              >
                {isDeficit ? t('yourLabNeeds') : t('yourLabCanSupply')}
              </span>
            )}

            {/* Reagent and labs */}
            <p className="pe-6 text-sm font-semibold text-foreground">
              {rec.reagentDisplay}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-foreground">
              <span className="font-medium text-red-700">{rec.deficitLabName}</span>
              <DirectionalIcon category="navigation">
                <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              </DirectionalIcon>
              <span className="font-medium text-green-700">{rec.sourceLabName}</span>
              <span className="text-xs text-muted-foreground">({rec.distanceLabel})</span>
            </div>

            {/* Stats */}
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>
                {t('deficit')}: {rec.deficitDaysOfSupply} {t('days')}
              </span>
              <span>
                {t('source')}: {rec.sourceDaysOfSupply} {t('days')}
              </span>
              <span className="font-medium text-foreground">
                {t('suggested')}: {rec.suggestedTransferQty} {t('units')}
              </span>
            </div>

            {/* Actions */}
            <div className="mt-3 flex gap-2">
              {isFlagged ? (
                <span className="rounded-md bg-green-100 px-3 py-1.5 text-xs font-medium text-green-800">
                  {t('transferRequested')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleInitiateTransfer(id)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden />
                  {t('initiateTransfer')}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
