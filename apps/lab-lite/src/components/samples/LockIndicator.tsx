'use client'

/**
 * LockIndicator — Story 51.3: Sample Collision Prevention
 *
 * Reusable badge showing the lock status of a sample.
 * Rendered in worklist rows, sample detail views, and search results.
 *
 * RTL-safe: uses logical properties (gap, flex direction).
 * PHI Rule: shows tech name and time only — no patient data.
 */

import { useTranslations } from 'next-intl'
import type { SampleLock } from '@/lib/db'
import { Lock } from '@ultranos/ui-kit/icons'

interface LockIndicatorProps {
  lock: SampleLock | null
}

function formatLockAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60) return `${diffMin}m`
  return `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`
}

export function LockIndicator({ lock }: LockIndicatorProps) {
  const t = useTranslations('lock')

  if (!lock || lock.status !== 'ACTIVE') return null

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800"
      title={`${t('locked')}: ${lock.techName} (${formatLockAge(lock.lockedAt)} ago)`}
      data-testid="lock-indicator"
      aria-label={`${t('locked')} ${lock.techName}`}
    >
      {/* Padlock icon */}
      <Lock size={12} className="shrink-0" aria-hidden="true" />
      <span>{lock.techName}</span>
      <span className="text-yellow-600">· {formatLockAge(lock.lockedAt)}</span>
    </span>
  )
}
