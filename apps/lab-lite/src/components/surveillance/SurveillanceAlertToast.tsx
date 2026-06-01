'use client'

/**
 * SurveillanceAlertToast — Story 50.3: Automated Disease Surveillance Alerts
 *
 * In-app banner that appears when a surveillance alert is generated locally.
 * Uses the onSurveillanceAlert event emitter from the scheduler.
 *
 * No PHI — alert messages contain aggregate data only.
 * AC #5: Tech is notified in-app when a surveillance alert is generated.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { AlertTriangle, X } from '@ultranos/ui-kit/icons'
import type { SurveillanceAlert } from '@/lib/surveillance-types'
import { onSurveillanceAlert } from '@/lib/surveillance-scheduler'

/** Maximum number of toasts shown simultaneously. Oldest are dropped. */
const MAX_TOASTS = 3
const AUTO_DISMISS_MS = 10_000 // 10 seconds

interface ToastEntry {
  alert: SurveillanceAlert
  id: string
}

export function SurveillanceAlertToast() {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('surveillance')

  useEffect(() => {
    const unsubscribe = onSurveillanceAlert((alert) => {
      setToasts((prev) => {
        const entry: ToastEntry = { alert, id: alert.id }
        const updated = [entry, ...prev].slice(0, MAX_TOASTS)
        return updated
      })
    })
    return unsubscribe
  }, [])

  // Auto-dismiss
  useEffect(() => {
    if (toasts.length === 0) return
    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(0, -1))
    }, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toasts])

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  const navigateToAlert = (alert: SurveillanceAlert) => {
    dismiss(alert.id)
    router.push(`/${locale}/reports/surveillance?alertId=${alert.id}`)
  }

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 end-4 z-50 flex flex-col gap-2"
      role="region"
      aria-label={t('alerts')}
      aria-live="polite"
    >
      {toasts.map(({ alert, id }) => (
        <div
          key={id}
          className={`flex max-w-sm items-start gap-3 rounded-lg border p-3 shadow-lg
            ${alert.severity === 'critical'
              ? 'border-red-300 bg-red-50 text-red-900'
              : 'border-amber-300 bg-amber-50 text-amber-900'
            }`}
          role="alert"
        >
          <AlertTriangle
            size={18}
            className="mt-0.5 shrink-0"
            aria-hidden
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold">
              {t('alertGenerated')} — {alert.diseaseLabel}
            </p>
            <p className="mt-0.5 text-xs line-clamp-2">{alert.message}</p>
            <button
              type="button"
              onClick={() => navigateToAlert(alert)}
              className="mt-1 text-xs underline opacity-80 hover:opacity-100"
            >
              {t('alertHistory')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => dismiss(id)}
            className="shrink-0 opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}
