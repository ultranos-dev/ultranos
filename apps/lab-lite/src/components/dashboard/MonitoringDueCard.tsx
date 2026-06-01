'use client'

/**
 * MonitoringDueCard — Story 52.1 Task 5
 *
 * Dashboard card showing patients with upcoming or overdue monitoring tests.
 * Overdue items render with red background per allergy display precedent
 * (high-visibility for safety-critical info — CLAUDE.md Rule #4 analogue).
 *
 * Data: queried from Dexie monitoringFlags where status in ['due', 'overdue'].
 * RTL-ready: uses logical CSS properties throughout.
 */

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { FlaskConical } from '@ultranos/ui-kit/icons'
import { getDb, type MonitoringFlag } from '@/lib/db'

function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  return Math.floor((b - a) / (1000 * 60 * 60 * 24))
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

interface MonitoringRowProps {
  flag: MonitoringFlag
  onRowClick?: (flag: MonitoringFlag) => void
}

function MonitoringRow({ flag, onRowClick }: MonitoringRowProps) {
  const t = useTranslations('dashboard')
  const todayStr = today()
  const daysOverdue = daysBetween(flag.dueDate, todayStr)
  const isOverdue = flag.status === 'overdue'

  return (
    <button
      type="button"
      className={`w-full rounded-md px-3 py-2 text-start transition-colors ${
        isOverdue
          ? 'border border-red-200 bg-red-50 hover:bg-red-100'
          : 'border border-amber-100 bg-amber-50 hover:bg-amber-100'
      }`}
      onClick={() => onRowClick?.(flag)}
      aria-label={`${flag.patientFirstName}, ${flag.testDisplay}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-neutral-900">
            {flag.patientFirstName}
            {', '}
            <span className="font-normal text-neutral-600">
              {t('monitoringYrOld', { age: flag.patientAge })}
            </span>
          </p>
          <p className="mt-0.5 truncate text-xs text-neutral-600">
            {flag.medicationDisplay} — {flag.testDisplay}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {t('monitoringDueSoon')}: {flag.dueDate}
          </p>
        </div>
        <div className="shrink-0">
          {isOverdue ? (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
              {t('monitoringOverdueDays', { days: daysOverdue })}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {t('monitoringDueSoon')}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

interface MonitoringDueCardProps {
  /** Called when a monitoring row is tapped — navigate to detail or sample reception */
  onFlagSelected?: (flag: MonitoringFlag) => void
}

export function MonitoringDueCard({ onFlagSelected }: MonitoringDueCardProps) {
  const t = useTranslations('dashboard')
  const [flags, setFlags] = useState<MonitoringFlag[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const db = getDb()
        const results = await db.monitoringFlags
          .where('status')
          .anyOf(['due', 'overdue'])
          .sortBy('dueDate')
        if (mounted) setFlags(results)
      } catch {
        // Fail silently — monitoring card is non-critical
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void load()
    return () => { mounted = false }
  }, [])

  const overdueCount = flags.filter((f) => f.status === 'overdue').length
  const totalCount = flags.length

  if (loading) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4" aria-busy="true" aria-label="Loading monitoring flags">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-pulse rounded bg-neutral-200" />
          <div className="h-3.5 w-32 animate-pulse rounded bg-neutral-200" />
        </div>
        <div className="mt-3 space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-neutral-100" />
          ))}
        </div>
      </div>
    )
  }

  if (totalCount === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <FlaskConical size={16} className="text-neutral-400" aria-hidden="true" />
          <h2 className="text-sm font-medium text-neutral-500">{t('monitoringDue')}</h2>
        </div>
        <div className="mt-3 rounded-md bg-neutral-50 px-3 py-4 text-center">
          <p className="text-sm font-medium text-neutral-600">{t('monitoringNoneTitle')}</p>
          <p className="mt-1 text-xs text-neutral-400">{t('monitoringNoneDesc')}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`rounded-lg border p-4 ${overdueCount > 0 ? 'border-red-200 bg-red-50/30' : 'border-amber-200 bg-amber-50/30'}`}
      role="region"
      aria-label={t('monitoringDue')}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical size={16} className={overdueCount > 0 ? 'text-red-500' : 'text-amber-500'} aria-hidden="true" />
          <h2 className="text-sm font-medium text-neutral-700">{t('monitoringDue')}</h2>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            overdueCount > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
          }`}
          aria-label={t('monitoringDueCount', { count: totalCount })}
        >
          {totalCount}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {/* Overdue flags first, then due flags — ordered by dueDate ascending */}
        {flags
          .slice()
          .sort((a, b) => {
            // overdue before due, then by dueDate ascending
            if (a.status === 'overdue' && b.status !== 'overdue') return -1
            if (a.status !== 'overdue' && b.status === 'overdue') return 1
            return a.dueDate.localeCompare(b.dueDate)
          })
          .map((flag) => (
            <MonitoringRow
              key={`${flag.patientRef}-${flag.medicationCode}-${flag.testRequired}`}
              flag={flag}
              onRowClick={onFlagSelected}
            />
          ))}
      </div>
    </div>
  )
}
