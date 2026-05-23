'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { db } from '@/lib/db'

export function QueueDepthCard() {
  const t = useTranslations('dashboard')
  const [depth, setDepth] = useState(0)

  useEffect(() => {
    async function loadQueue() {
      try {
        // Count encounters created today with status 'planned' or 'in-progress'
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const todayIso = todayStart.toISOString()

        const waiting = await db.encounters
          .filter(
            (e) =>
              (e.status === 'planned' || e.status === 'arrived') &&
              (e.meta?.lastUpdated ?? '') >= todayIso
          )
          .count()
        setDepth(waiting)
      } catch {
        setDepth(0)
      }
    }

    loadQueue()
    const interval = setInterval(loadQueue, 15_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="rounded-xl bg-card-bg p-5 shadow-sm" role="status" aria-label={t('queueDepth')}>
      <h3 className="text-sm font-black text-neutral-500 uppercase tracking-wide">
        {t('queueDepth')}
      </h3>
      <p className="mt-2 text-3xl font-black text-neutral-900">{depth}</p>
      {depth > 0 && (
        <p className="mt-2 text-sm font-semibold text-neutral-500">
          {t('patientsWaiting')}
        </p>
      )}
    </div>
  )
}
