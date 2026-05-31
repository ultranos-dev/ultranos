'use client'

/**
 * SampleLockBlocker — Story 51.3: Sample Collision Prevention
 *
 * Dialog shown when a technician attempts to start processing a sample
 * that is already locked by another tech. Provides clear messaging and
 * a "Request Release" action.
 *
 * RTL-safe: uses logical CSS properties via Tailwind (ms-*, me-*).
 * PHI Rule: shows tech name and timestamp only — no patient data.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Lock } from '@ultranos/ui-kit/icons'

interface SampleLockBlockerProps {
  /** Name of the tech who holds the lock */
  lockedByName: string
  /** ISO 8601 timestamp when the lock was acquired */
  lockedAt: string
  /** Called when the user dismisses the dialog */
  onDismiss: () => void
  /** Called when the user requests a release — triggers Hub notification */
  onRequestRelease: () => Promise<void>
}

function formatLockTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  return `${diffHrs}h ${diffMin % 60}m ago`
}

export function SampleLockBlocker({
  lockedByName,
  lockedAt,
  onDismiss,
  onRequestRelease,
}: SampleLockBlockerProps) {
  const t = useTranslations('lock')
  const [requesting, setRequesting] = useState(false)
  const [requested, setRequested] = useState(false)

  async function handleRequestRelease() {
    setRequesting(true)
    try {
      await onRequestRelease()
      setRequested(true)
    } finally {
      setRequesting(false)
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-blocker-title"
      data-testid="sample-lock-blocker"
    >
      {/* Card */}
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-neutral-100 p-5">
          {/* Lock icon */}
          <span className="shrink-0 text-yellow-500" aria-hidden="true">
            <Lock size={24} />
          </span>
          <div>
            <h2
              id="lock-blocker-title"
              className="text-base font-semibold text-neutral-900"
            >
              {t('duplicatePrevented')}
            </h2>
            <p className="mt-1 text-sm text-neutral-600" data-testid="lock-blocker-message">
              {t('lockedBy', { name: lockedByName, time: formatLockTime(lockedAt) })}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 p-4">
          {!requested ? (
            <button
              type="button"
              onClick={handleRequestRelease}
              disabled={requesting}
              data-testid="request-release-button"
              className="
                w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white
                hover:bg-blue-700 disabled:opacity-60 transition-colors
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-blue-600
              "
            >
              {requesting ? '…' : t('requestRelease')}
            </button>
          ) : (
            <p
              className="text-center text-sm text-green-700 font-medium py-2"
              data-testid="release-requested-confirmation"
            >
              ✓ {t('releaseRequested')}
            </p>
          )}

          <button
            type="button"
            onClick={onDismiss}
            data-testid="dismiss-button"
            className="
              w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5
              text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-neutral-500
            "
          >
            {t('ok')}
          </button>
        </div>
      </div>
    </div>
  )
}
