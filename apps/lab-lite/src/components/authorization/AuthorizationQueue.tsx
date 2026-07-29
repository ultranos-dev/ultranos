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
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { CircleCheck, FileSearch } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import { useRouter } from 'next/navigation'
import { getDb } from '@/lib/db'
import { canAuthorize, canReject, canHold } from '@/lib/permissions'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { LabRole } from '@ultranos/shared-types'
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
          ? 'bg-destructive/10 text-destructive'
          : 'bg-warning/10 text-warning',
      ].join(' ')}
    >
      {flag}
    </span>
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
  const [search, setSearch] = useState('')

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
  const query = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    let rows = results
    if (categoryFilter) rows = rows.filter((r) => r.testCategory === categoryFilter)
    if (techFilter) rows = rows.filter((r) => r.enteredBy === techFilter)
    if (query) {
      rows = rows.filter((r) => {
        const rec = r as unknown as Record<string, unknown>
        return ['patientFirstName', 'testCategory', 'loincCode', 'enteredBy']
          .map((k) => rec[k])
          .filter((v): v is string => typeof v === 'string')
          .join(' ')
          .toLowerCase()
          .includes(query)
      })
    }
    return rows
  }, [results, categoryFilter, techFilter, query])

  const filtersActive = categoryFilter !== null || techFilter !== null || query !== ''
  const clearFilters = () => {
    setCategoryFilter(null)
    setTechFilter(null)
    setSearch('')
  }

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

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: search + sort + filters — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          type="text"
          dir="auto"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          aria-label={t('searchPlaceholder')}
        />
        <select
          className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
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
            className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
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
            className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
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

      {/* Content box — single cohesive box (loading / empty / table) */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground" aria-busy="true" aria-label={t('loading')}>
            {t('loading')}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={filtersActive ? FileSearch : CircleCheck}
              title={filtersActive ? t('noResultsTitle') : t('emptyTitle')}
              description={filtersActive ? t('noResultsDescription') : t('emptySubtitle')}
              action={filtersActive ? { label: t('clearFilters'), onClick: clearFilters } : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm" role="table" aria-label={t('queueTitle')}>
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colPatient')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colTest')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colTech')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colTime')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colFlags')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
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
                      'transition-colors hover:bg-muted/50',
                      critical ? 'border-s-4 border-s-destructive' : '',
                    ].join(' ')}
                    role="row"
                  >
                    {/* Patient — first name + age only */}
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">
                        {result.patientFirstName ?? '—'}
                      </span>
                      {result.patientAge != null && (
                        <span className="ms-1.5 text-muted-foreground">
                          {result.patientAge}y
                        </span>
                      )}
                      {critical && (
                        <span className="ms-2 inline-flex items-center rounded bg-destructive px-1.5 py-0.5 text-xs font-bold text-destructive-foreground uppercase tracking-wide">
                          {t('criticalBadge')}
                        </span>
                      )}
                    </td>

                    {/* Test */}
                    <td className="px-4 py-3 text-foreground">
                      {result.testCategory ?? result.loincCode ?? '—'}
                    </td>

                    {/* Tech */}
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {result.enteredBy}
                    </td>

                    {/* Time */}
                    <td className="px-4 py-3 text-muted-foreground">
                      {result.enteredAt ? formatRelativeTime(result.enteredAt) : '—'}
                    </td>

                    {/* Flags */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {flags.length === 0 ? (
                          <span className="text-muted-foreground text-xs">{t('noFlags')}</span>
                        ) : (
                          flags.map((f, i) => <FlagBadge key={i} flag={f} />)
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => router.push(`authorization/${result.id}`)}
                        disabled={!rowCanAuthorize && !rowCanReject && !rowCanHold}
                        aria-label={`${t('reviewButton')} ${result.patientFirstName ?? ''}`}
                      >
                        {t('reviewButton')}
                      </Button>
                    </td>
                  </tr>
                )
              })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
