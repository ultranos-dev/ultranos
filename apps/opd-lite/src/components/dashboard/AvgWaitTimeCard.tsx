'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { db } from '@/lib/db'
import { deserializeHlc } from '@ultranos/sync-engine'

export function AvgWaitTimeCard() {
  const t = useTranslations('dashboard')
  const [avgMinutes, setAvgMinutes] = useState<number | null>(null)

  useEffect(() => {
    async function calcWaitTime() {
      try {
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const todayMs = todayStart.getTime()

        // Get today's encounters that have transitioned from 'arrived' → 'in-progress'
        const encounters = await db.encounters
          .filter((e) => {
            if (e.status !== 'in-progress' && e.status !== 'finished') return false
            const ts = e._ultranos?.hlcTimestamp ?? ''
            if (!ts) return false
            try {
              return deserializeHlc(ts).wallMs >= todayMs
            } catch {
              return false
            }
          })
          .toArray()

        if (encounters.length === 0) {
          setAvgMinutes(null)
          return
        }

        // Estimate wait = time between encounter creation (period.start or HLC) and first status change
        // For now, use period.start → period.start as a proxy (arrival → consultation start)
        let totalWaitMs = 0
        let counted = 0

        for (const enc of encounters) {
          const start = enc.period?.start
          const hlc = enc._ultranos?.hlcTimestamp
          if (start && hlc) {
            try {
              const arrivalMs = new Date(start).getTime()
              const consultMs = deserializeHlc(hlc).wallMs
              const wait = consultMs - arrivalMs
              if (wait > 0 && wait < 24 * 60 * 60 * 1000) {
                totalWaitMs += wait
                counted++
              }
            } catch {
              // Skip malformed entries
            }
          }
        }

        setAvgMinutes(counted > 0 ? Math.round(totalWaitMs / counted / 60_000) : null)
      } catch {
        setAvgMinutes(null)
      }
    }

    calcWaitTime()
    const interval = setInterval(calcWaitTime, 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="rounded-xl bg-card-bg p-5 shadow-sm" role="status" aria-label={t('avgWaitTime')}>
      <h3 className="text-sm font-black text-neutral-500 uppercase tracking-wide">
        {t('avgWaitTime')}
      </h3>
      <p className="mt-2 text-3xl font-black text-neutral-900">
        {avgMinutes !== null ? `${avgMinutes}m` : '—'}
      </p>
      {avgMinutes !== null && (
        <p className="mt-2 text-sm font-semibold text-neutral-500">
          {t('avgWaitTimeDesc')}
        </p>
      )}
      {avgMinutes === null && (
        <p className="mt-2 text-sm font-semibold text-neutral-400">
          {t('noDataYet')}
        </p>
      )}
    </div>
  )
}
