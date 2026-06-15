'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { db } from '@/lib/db'
import { Card } from '@/components/Card'
import { useEncounterStore } from '@/stores/encounter-store'
import { deserializeHlc } from '@ultranos/sync-engine'

interface TodayStats {
  total: number
  hasActive: boolean
}

export function TodayEncountersCard() {
  const t = useTranslations('dashboard')
  const tEnc = useTranslations('encounter')
  const [stats, setStats] = useState<TodayStats>({ total: 0, hasActive: false })
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
      }
    }

    loadToday()
  }, [activeEncounter])

  return (
    <Card>
      <h3 className="text-sm font-black text-muted-foreground uppercase tracking-wide">
        {t('todayEncounters')}
      </h3>
      <p className="mt-2 text-3xl font-black text-foreground">{stats.total}</p>
      {stats.hasActive && (
        <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-success">
          <span className="inline-block h-2 w-2 rounded-full bg-success animate-pulse" />
          {tEnc('activeConsultation')}
        </span>
      )}
    </Card>
  )
}
