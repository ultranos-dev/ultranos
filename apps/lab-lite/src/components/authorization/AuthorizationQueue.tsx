'use client'

/**
 * Story 42.5 — Authorization Queue UI
 * Task 4: Full-page table of PENDING lab results for supervisor review.
 *
 * Critical value rows have a red left border and CRITICAL badge —
 * visually unmissable per CLAUDE.md Rule #4 (allergy-prominence pattern).
 * RTL: uses logical CSS properties (ms-*, ps-*, etc.) throughout.
 */
import { useEffect, useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { CircleCheck } from '@ultranos/ui-kit/icons'
import { useRouter } from 'next/navigation'
import { getDb } from '@/lib/db'
import { canAuthorize, canReject, canHold } from '@/lib/permissions'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { LabRole } from '@ultranos/shared-types'
import type { LabResult } from '@/lib/db'
import type { AbnormalityFlag } from '@/types/authorization'
import { AuthorizationStatus } from '@/types/authorization'

type SortKey = 'severity' | 'timestamp' | 'urgency'
type FilterCategory = string | null

const CRITICAL_FLAGS: readonly AbnormalityFlag[] = ['LL', 'HH']

function isCriticalResult(flags: AbnormalityFlag[]): boolean {
  return flags.some((f) => CRITICAL_FLAGS.includes(f))
}

function flagSeverityScore(flags: AbnormalityFlag[]): number {
  if (flags.includes('LL') || flags.includes('HH')) return 3
  if (flags.includes('L') || flags.includes('H')) return 2
  return 1
}

function FlagBadge({ flag }: { flag: AbnormalityFlag }) {
  const critical = flag === 'LL' || flag === 'HH'
  return (
    <span
      className={[
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold',
        critical
          ? 'bg-red-100 text-red-800'
          : 'bg-amber-100 text-amber-800',
      ].join(' ')}
    >
      {flag}
    </span>
  )
}

function EmptyState({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
      <CircleCheck size={56} className="mb-4 text-green-400" aria-hidden="true" />
      <p className="text-lg font-medium">{t('emptyTitle')}</p>
      <p className="mt-1 text-sm">{t('emptySubtitle')}</p>
    </div>
  )
}

interface AuthorizationQueueProps {
  /** Override pending results (for testing / SSR). */
  results?: LabResult[]
}

export function AuthorizationQueue({ results: externalResults }: AuthorizationQueueProps) {
  const t = useTranslations('authorization')
  const router = useRouter()
  const session = useAuthSessionStore((s) => s.session)
  const labRole = session?.labRole as LabRole | null

  const [results, setResults] = useState<LabResult[]>(externalResults ?? [])
  const [loading, setLoading] = useState(!externalResults)
  const [sortKey, setSortKey] = useState<SortKey>('severity')
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>(null)
  const [techFilter, setTechFilter] = useState<string | null>(null)

  useEffect(() => {
    if (externalResults) return
    let active = true

    async function load() {
      setLoading(true)
      try {
        const db = getDb()
        const rows = await db.lab_results
          .where('authorizationStatus')
          .equals(AuthorizationStatus.PENDING)
          .toArray()
        if (active) setResults(rows)
      } catch {
        // Dexie unavailable — show empty state
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 15_000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [externalResults])

  // Derive filter options
  const categories = useMemo(
    () => [...new Set(results.map((r) => r.testCategory).filter(Boolean))],
    [results],
  )
  const technicians = useMemo(
    () => [...new Set(results.map((r) => r.enteredBy).filter(Boolean))],
    [results],
  )

  // Filter
  const filtered = useMemo(() => {
    let rows = results
    if (categoryFilter) rows = rows.filter((r) => r.testCategory === categoryFilter)
    if (techFilter) rows = rows.filter((r) => r.enteredBy === techFilter)
    return rows
  }, [results, categoryFilter, techFilter])

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aFlags = (a.abnormalityFlags ?? []) as AbnormalityFlag[]
      const bFlags = (b.abnormalityFlags ?? []) as AbnormalityFlag[]

      if (sortKey === 'severity') {
        const diff = flagSeverityScore(bFlags) - flagSeverityScore(aFlags)
        if (diff !== 0) return diff
        // Tiebreak: oldest first
        return (a.enteredAt ?? '').localeCompare(b.enteredAt ?? '')
      }

      if (sortKey === 'timestamp') {
        return (a.enteredAt ?? '').localeCompare(b.enteredAt ?? '')
      }

      if (sortKey === 'urgency') {
        const urgencyOrder = { stat: 0, asap: 1, urgent: 2, routine: 3 }
        // lab_results don't carry urgency directly, fall back to severity sort
        const diff = flagSeverityScore(bFlags) - flagSeverityScore(aFlags)
        if (diff !== 0) return diff
        return (a.enteredAt ?? '').localeCompare(b.enteredAt ?? '')
      }

      return 0
    })
  }, [filtered, sortKey])

  function formatRelativeTime(isoOrHlc: string): string {
    const ms = Date.now() - new Date(isoOrHlc.slice(0, 24)).getTime()
    const mins = Math.floor(ms / 60000)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 p-4" aria-busy="true" aria-label={t('loading')}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-neutral-100" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3">
        <select
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          aria-label={t('sortBy')}
        >
          <option value="severity">{t('sortSeverity')}</option>
          <option value="timestamp">{t('sortTimestamp')}</option>
          <option value="urgency">{t('sortUrgency')}</option>
        </select>

        {categories.length > 0 && (
          <select
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm"
            value={categoryFilter ?? ''}
            onChange={(e) => setCategoryFilter(e.target.value || null)}
            aria-label={t('filterCategory')}
          >
            <option value="">{t('allCategories')}</option>
            {categories.map((c) => (
              <option key={c} value={c ?? ''}>{c}</option>
            ))}
          </select>
        )}

        {technicians.length > 0 && (
          <select
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm"
            value={techFilter ?? ''}
            onChange={(e) => setTechFilter(e.target.value || null)}
            aria-label={t('filterTechnician')}
          >
            <option value="">{t('allTechnicians')}</option>
            {technicians.map((tech) => (
              <option key={tech} value={tech ?? ''}>{tech}</option>
            ))}
          </select>
        )}
      </div>

      {/* Table / Card list */}
      {sorted.length === 0 ? (
        <EmptyState t={t} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
          <table className="w-full text-sm" role="table" aria-label={t('queueTitle')}>
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-start font-semibold text-neutral-700">{t('colPatient')}</th>
                <th className="px-4 py-3 text-start font-semibold text-neutral-700">{t('colTest')}</th>
                <th className="px-4 py-3 text-start font-semibold text-neutral-700">{t('colTech')}</th>
                <th className="px-4 py-3 text-start font-semibold text-neutral-700">{t('colTime')}</th>
                <th className="px-4 py-3 text-start font-semibold text-neutral-700">{t('colFlags')}</th>
                <th className="px-4 py-3 text-start font-semibold text-neutral-700">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {sorted.map((result) => {
                const flags = (result.abnormalityFlags ?? []) as AbnormalityFlag[]
                const critical = isCriticalResult(flags)
                const rowCanAuthorize = labRole
                  ? canAuthorize(labRole, session?.userId ?? '', {
                      id: result.id,
                      enteredBy: result.enteredBy,
                      abnormalityFlags: flags,
                    })
                  : false
                const rowCanReject = labRole ? canReject(labRole) : false
                const rowCanHold = labRole ? canHold(labRole) : false

                return (
                  <tr
                    key={result.id}
                    className={[
                      'transition-colors hover:bg-neutral-50',
                      critical ? 'border-s-4 border-s-red-500' : '',
                    ].join(' ')}
                    role="row"
                  >
                    {/* Patient — first name + age only */}
                    <td className="px-4 py-3">
                      <span className="font-medium text-neutral-900">
                        {result.patientFirstName ?? '—'}
                      </span>
                      {result.patientAge != null && (
                        <span className="ms-1.5 text-neutral-500">
                          {result.patientAge}y
                        </span>
                      )}
                      {critical && (
                        <span className="ms-2 inline-flex items-center rounded bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white uppercase tracking-wide">
                          {t('criticalBadge')}
                        </span>
                      )}
                    </td>

                    {/* Test */}
                    <td className="px-4 py-3 text-neutral-700">
                      {result.testCategory ?? result.loincCode ?? '—'}
                    </td>

                    {/* Tech */}
                    <td className="px-4 py-3 text-neutral-500 font-mono text-xs">
                      {result.enteredBy}
                    </td>

                    {/* Time */}
                    <td className="px-4 py-3 text-neutral-500">
                      {result.enteredAt ? formatRelativeTime(result.enteredAt) : '—'}
                    </td>

                    {/* Flags */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {flags.length === 0 ? (
                          <span className="text-neutral-400 text-xs">{t('noFlags')}</span>
                        ) : (
                          flags.map((f, i) => <FlagBadge key={i} flag={f} />)
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => router.push(`authorization/${result.id}`)}
                        className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-40"
                        disabled={!rowCanAuthorize && !rowCanReject && !rowCanHold}
                        aria-label={`${t('reviewButton')} ${result.patientFirstName ?? ''}`}
                      >
                        {t('reviewButton')}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
