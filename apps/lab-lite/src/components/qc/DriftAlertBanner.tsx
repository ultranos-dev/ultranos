'use client'

/**
 * DriftAlertBanner — Story 43.6
 *
 * Persistent banner shown on the dashboard and result entry pages when active
 * drift alerts exist. Displays the most severe alert with severity-coded styling.
 *
 * RTL: All layout uses logical CSS properties (ms-/me- not ml-/mr-).
 * Colors: Red for REJECT rules (out of control), amber for WARNING rules.
 */

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { DriftAlert } from '@/lib/qc/types'
import { DriftAlertAcknowledgment } from './DriftAlertAcknowledgment'

interface DriftAlertBannerProps {
  alerts: DriftAlert[]
  onAcknowledged?: () => void
}

/**
 * Renders a persistent alert banner for the most critical active drift alert.
 * If multiple alerts exist, shows the count and severity breakdown.
 */
export function DriftAlertBanner({ alerts, onAcknowledged }: DriftAlertBannerProps) {
  const t = useTranslations('qc')
  const router = useRouter()
  const [showAcknowledgment, setShowAcknowledgment] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState<DriftAlert | null>(null)

  if (alerts.length === 0) return null

  // Show the most severe alert (REJECT before WARNING, then most recent)
  const primaryAlert = alerts[0]
  const isReject = primaryAlert.severity === 'REJECT'
  const rejectCount = alerts.filter((a) => a.severity === 'REJECT').length
  const warningCount = alerts.filter((a) => a.severity === 'WARNING').length

  const bannerBg = isReject ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'
  const textColor = isReject ? 'text-red-800' : 'text-amber-800'
  const iconColor = isReject ? 'text-red-500' : 'text-amber-500'
  const buttonBg = isReject
    ? 'bg-red-100 hover:bg-red-200 text-red-800'
    : 'bg-amber-100 hover:bg-amber-200 text-amber-800'

  function handleAcknowledge() {
    setSelectedAlert(primaryAlert)
    setShowAcknowledgment(true)
  }

  function handleViewHistory() {
    router.push('/qc')
  }

  function handleAcknowledgmentComplete() {
    setShowAcknowledgment(false)
    setSelectedAlert(null)
    onAcknowledged?.()
  }

  return (
    <>
      <div
        className={`rounded-lg border p-3 ${bannerBg}`}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        data-testid="drift-alert-banner"
        data-severity={primaryAlert.severity}
      >
        <div className="flex items-start gap-3">
          {/* Warning icon */}
          <div className={`mt-0.5 shrink-0 ${iconColor}`} aria-hidden="true">
            {isReject ? (
              <svg
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>

          {/* Alert content */}
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${textColor}`}>
              {isReject ? t('driftRejectTitle') : t('driftWarningTitle')}
              {alerts.length > 1 && (
                <span className="ms-2 text-xs font-normal opacity-75">
                  ({rejectCount > 0 && `${rejectCount} REJECT`}
                  {rejectCount > 0 && warningCount > 0 && ', '}
                  {warningCount > 0 && `${warningCount} WARNING`})
                </span>
              )}
            </p>
            <p className={`mt-0.5 text-sm ${textColor}`}>
              {primaryAlert.message}
            </p>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
            <button
              type="button"
              onClick={handleAcknowledge}
              className={`rounded px-2.5 py-1 text-xs font-medium ${buttonBg} transition-colors`}
              aria-label={t('acknowledgeAlert')}
            >
              {t('acknowledge')}
            </button>
            <button
              type="button"
              onClick={handleViewHistory}
              className={`rounded px-2.5 py-1 text-xs font-medium ${buttonBg} transition-colors`}
              aria-label={t('viewQcHistory')}
            >
              {t('viewHistory')}
            </button>
          </div>
        </div>
      </div>

      {showAcknowledgment && selectedAlert && (
        <DriftAlertAcknowledgment
          alert={selectedAlert}
          onComplete={handleAcknowledgmentComplete}
          onCancel={() => setShowAcknowledgment(false)}
        />
      )}
    </>
  )
}
