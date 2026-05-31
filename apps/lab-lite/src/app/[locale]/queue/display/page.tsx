'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getDb } from '@/lib/db'
import type { PatientQueueEntry } from '@/lib/patient-queue'
import { parseOverflowIndex } from '@/lib/token-generator'
import { TokenBadge } from '@/components/queue/TokenBadge'

/**
 * Full-screen queue display for wall-mounted tablets/monitors.
 * Shows ONLY tokens — NO patient names, IDs, or demographics (PHI protection).
 * Auto-refreshes every 3 seconds via polling.
 */
export default function QueueDisplayPage() {
  const t = useTranslations('patientQueue.tokens')
  const [serving, setServing] = useState<PatientQueueEntry | null>(null)
  const [waiting, setWaiting] = useState<PatientQueueEntry[]>([])
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    let active = true
    let prevServingKey: string | null = null

    async function poll() {
      if (!active) return
      try {
        const db = getDb()
        const entries = await db
          .table('queueEntries')
          .where('status')
          .anyOf(['waiting', 'serving'])
          .sortBy('registeredAt')

        const servingEntry =
          entries.find((e: PatientQueueEntry) => e.status === 'serving') ?? null
        const waitingEntries = entries.filter(
          (e: PatientQueueEntry) => e.status === 'waiting',
        )

        if (active) {
          if (
            servingEntry &&
            servingEntry.tokenDisplayKey !== prevServingKey
          ) {
            setFlash(true)
            setTimeout(() => setFlash(false), 1500)
          }
          prevServingKey = servingEntry?.tokenDisplayKey ?? null
          setServing(servingEntry)
          setWaiting(waitingEntries)
        }
      } catch {
        // Dexie unavailable — display will retry on next poll
      }
    }

    poll()
    const interval = setInterval(poll, 3000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 text-white p-6">
      {/* Now Serving */}
      <section className="flex flex-1 flex-col items-center justify-center">
        <h1 className="text-[48px] font-bold tracking-tight mb-8">
          {t('nowServing')}
        </h1>
        {serving ? (
          <div
            className={`transition-transform duration-300 ${flash ? 'scale-110' : 'scale-100'}`}
          >
            <TokenBadge
              color={serving.tokenColor}
              symbol={serving.tokenSymbol}
              size="xl"
              overflowIndex={parseOverflowIndex(serving.tokenDisplayKey)}
            />
          </div>
        ) : (
          <p className="text-2xl text-neutral-500">—</p>
        )}
      </section>

      {/* Divider */}
      <hr className="border-neutral-700 my-4" />

      {/* Waiting list */}
      <section className="pb-4">
        <h2 className="text-[32px] font-semibold mb-4">{t('waiting')}</h2>
        {waiting.length === 0 ? (
          <p className="text-xl text-neutral-500">{t('emptyQueue')}</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {waiting.map((entry, index) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 rounded-lg bg-neutral-900 px-4 py-3"
              >
                <span className="text-[32px] font-mono text-neutral-400">
                  {index + 1}
                </span>
                <TokenBadge
                  color={entry.tokenColor}
                  symbol={entry.tokenSymbol}
                  size="lg"
                  overflowIndex={parseOverflowIndex(entry.tokenDisplayKey)}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
