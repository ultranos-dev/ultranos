'use client'

/**
 * LearningNotification — Story 46.2 (Task 3)
 *
 * Non-intrusive toast/banner shown when a contextual micro-learning trigger fires.
 * Displays: "Quick refresher available: [Procedure Name] (N min)"
 * Actions: "Start" (open module) | "Dismiss" (suppress for this session).
 *
 * Session-scoped dismiss: uses a module-level in-memory Set so the same
 * procedure ref is not re-triggered within the current browser session.
 * Not persisted — triggers can fire again after app restart.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TriggerResult } from '@/lib/micro-learning-types'

// In-memory set: procedure refs dismissed in this browser session (AC 5, Dev Notes)
const sessionDismissed = new Set<string>()

/**
 * Check whether a procedureRef has been dismissed in this session.
 * Exported for testability.
 */
export function isSessionDismissed(procedureRef: string): boolean {
  return sessionDismissed.has(procedureRef)
}

/** Mark a procedure as dismissed for this session. */
export function dismissForSession(procedureRef: string): void {
  sessionDismissed.add(procedureRef)
}

/** Clear all session dismissals (used in tests). */
export function clearSessionDismissals(): void {
  sessionDismissed.clear()
}

interface LearningNotificationProps {
  trigger: TriggerResult
  procedureRef: string
  onStart: () => void
  onDismiss: () => void
}

export function LearningNotification({
  trigger,
  procedureRef,
  onStart,
  onDismiss,
}: LearningNotificationProps) {
  const t = useTranslations('learning')
  const [visible, setVisible] = useState(true)

  if (!visible) return null

  function handleDismiss() {
    dismissForSession(procedureRef)
    setVisible(false)
    onDismiss()
  }

  function handleStart() {
    setVisible(false)
    onStart()
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-lg border border-blue-300 bg-blue-50 p-3 dark:border-blue-700 dark:bg-blue-900/20"
      data-testid="learning-notification"
    >
      <div className="flex items-start gap-3">
        {/* Book icon — not a directional icon, no RTL mirroring needed */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="mt-0.5 flex-shrink-0 text-blue-600 dark:text-blue-400"
        >
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>

        <div className="flex-1">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
            {t('notificationTitle', {
              procedureName: trigger.procedureName,
              minutes: trigger.durationMinutes,
            })}
          </p>
          <p className="mt-0.5 text-xs text-blue-600 dark:text-blue-400">
            {t(`triggerReason.${trigger.type}`)}
          </p>

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleStart}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-blue-500 dark:hover:bg-blue-400"
              data-testid="learning-notification-start"
            >
              {t('start')}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded border border-blue-300 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-blue-600 dark:text-blue-300 dark:hover:bg-blue-900/40"
              data-testid="learning-notification-dismiss"
            >
              {t('dismiss')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
