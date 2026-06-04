'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { db } from '@/lib/db'
import { TIER_1_RESOURCE_TYPES } from '@/lib/conflict-resolution'

interface ConflictBannerProps {
  patientId: string
}

/**
 * Inline banner for patient chart showing unresolved sync conflicts.
 *
 * - Tier 1 (red, uncollapsible): blocks prescriptions, links to conflict review
 * - Tier 2 (yellow, informational): addenda available for review
 *
 * Renders at the TOP of the chart, same prominence rules as allergies (CLAUDE.md Rule #4).
 */
export function ConflictBanner({ patientId }: ConflictBannerProps) {
  const [tier1Count, setTier1Count] = useState(0)
  const [loading, setLoading] = useState(true)

  const loadConflicts = useCallback(async () => {
    try {
      const patientRef = `Patient/${patientId}`
      const all = await db.syncQueue.toArray()

      const tier1 = all.filter(
        (entry) =>
          entry.patientRef === patientRef &&
          entry.conflictFlag === true &&
          entry.status !== 'synced' &&
          (TIER_1_RESOURCE_TYPES as readonly string[]).includes(entry.resourceType),
      )

      setTier1Count(tier1.length)
    } catch {
      // Fail silently — don't block chart access
      setTier1Count(0)
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    loadConflicts()
    const interval = setInterval(loadConflicts, 5_000)
    return () => clearInterval(interval)
  }, [loadConflicts])

  if (loading || tier1Count === 0) return null

  return (
    <div
      className="mb-4 rounded-lg border-2 border-destructive bg-destructive/10 p-4"
      role="alert"
      aria-live="assertive"
      data-testid="conflict-banner"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm font-bold text-destructive">
            {tier1Count} unresolved safety-critical conflict{tier1Count !== 1 ? 's' : ''} — prescription generation blocked
          </p>
          <p className="mt-1 text-xs text-destructive">
            Allergies, medications, or diagnoses have conflicting versions from another device.
            Resolve before prescribing.
          </p>
          <Link
            href="/conflicts"
            className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-destructive underline hover:text-destructive"
          >
            Review Conflicts
            <DirectionalIcon category="navigation" aria-hidden={true}>
              <ArrowRight className="h-4 w-4" />
            </DirectionalIcon>
          </Link>
        </div>
      </div>
    </div>
  )
}
