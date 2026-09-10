'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { listNotifications, acknowledgeNotification, type PharmacyNotification } from '@/lib/trpc'

/** Notification type → i18n label key (falls back to a generic label). */
const LABEL_KEY: Record<string, string> = {
  DISPENSE_REVIEW_RESOLVED: 'typeDispenseReviewResolved',
  PRESCRIPTION_DISPENSED: 'typePrescriptionDispensed',
}

export function NotificationPanel({ onClose, onChange }: { onClose: () => void; onChange: () => void }) {
  const t = useTranslations('notifications')
  const [items, setItems] = useState<PharmacyNotification[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    listNotifications()
      .then((n) => { if (active) setItems(n) })
      .catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [])

  const ack = useCallback(async (id: string) => {
    await acknowledgeNotification(id)
    setItems((prev) => prev?.map((n) => (n.id === id ? { ...n, status: 'ACKNOWLEDGED' } : n)) ?? null)
    onChange()
  }, [onChange])

  return (
    <div
      data-testid="notification-panel"
      className="absolute end-0 top-11 z-50 w-80 overflow-hidden rounded-xl bg-popover shadow-lg ring-[0.65px] ring-border/50"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-sm font-semibold text-foreground">{t('title')}</span>
        <button type="button" onClick={onClose} aria-label={t('closeAria')} className="text-lg leading-none text-muted-foreground hover:text-foreground">×</button>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {error ? (
          <p data-testid="notification-error" className="px-4 py-6 text-center text-sm text-destructive">{t('error')}</p>
        ) : items === null ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('loading')}</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => {
              const unread = n.status !== 'ACKNOWLEDGED'
              const labelKey = LABEL_KEY[n.type] ?? 'typeDefault'
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    data-testid="notification-item"
                    onClick={() => { if (unread) void ack(n.id) }}
                    className={`flex w-full items-start gap-2 px-4 py-3 text-start ${unread ? 'bg-primary/5' : ''}`}
                  >
                    {unread && <span data-testid="unread-dot" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    <span className={`text-sm ${unread ? 'font-semibold text-foreground' : 'font-normal text-muted-foreground'}`}>{t(labelKey)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
