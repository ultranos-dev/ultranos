'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { db } from '@/lib/db'
import { Card } from '@/components/Card'
import { useEncounterStore } from '@/stores/encounter-store'
import { deserializeHlc } from '@ultranos/sync-engine'
import { Skeleton } from '@ultranos/ui-kit/components/ui/skeleton'
import { CalendarDays } from '@ultranos/ui-kit/icons'

interface TodayStats {
  total: number
  hasActive: boolean
}

export function TodayEncountersCard() {
  const t = useTranslations('dashboard')
  const tEnc = useTranslations('encounter')
  const [stats, setStats] = useState<TodayStats>({ total: 0, hasActive: false })
  const [loading, setLoading] = useState(true)
  const activeEncounter = useEncounterStore((s) => s.activeEncounter)

  useEffect(() => {
    async function loadToday() {
      try {
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const todayMs = todayStart.getTime()

        const encounters = await db.encounters
          .orderBy('_ultranos.hlcTimestamp')
          .filter((e) => {
            const ts = e._ultranos?.hlcTimestamp ?? ''
            if (!ts) {
              // Fall back to meta.lastUpdated (ISO 8601)
              const fallback = e.meta?.lastUpdated ?? ''
              return fallback ? new Date(fallback).getTime() >= todayMs : false
            }
            try {
              const hlc = deserializeHlc(ts)
              return hlc.wallMs >= todayMs
            } catch {
              return false
            }
          })
          .toArray()

        setStats({
          total: encounters.length,
          hasActive: encounters.some((e) => e.status === 'in-progress'),
        })
      } catch {
        // Dexie unavailable — show zero state
        setStats({ total: 0, hasActive: false })
      } finally {
        setLoading(false)
      }
    }

    loadToday()
  }, [activeEncounter])

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('todayEncounters')}
        </h3>
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-12" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{stats.total}</p>
      )}
      {stats.hasActive && (
        <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-success">
          <span className="inline-block h-2 w-2 rounded-full bg-success animate-pulse" />
          {tEnc('activeConsultation')}
        </span>
      )}
    </Card>
  )
}
