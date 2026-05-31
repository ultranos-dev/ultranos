'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
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
      className="mb-4 rounded-lg border-2 border-red-500 bg-red-50 p-4"
      role="alert"
      aria-live="assertive"
      data-testid="conflict-banner"
    >
      <div className="flex items-start gap-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="mt-0.5 h-5 w-5 shrink-0 text-red-600"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-bold text-red-800">
            {tier1Count} unresolved safety-critical conflict{tier1Count !== 1 ? 's' : ''} — prescription generation blocked
          </p>
          <p className="mt-1 text-xs text-red-700">
            Allergies, medications, or diagnoses have conflicting versions from another device.
            Resolve before prescribing.
          </p>
          <Link
            href="/conflicts"
            className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-red-700 underline hover:text-red-900"
          >
            Review Conflicts
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-4 w-4 rtl:rotate-180"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  )
}
