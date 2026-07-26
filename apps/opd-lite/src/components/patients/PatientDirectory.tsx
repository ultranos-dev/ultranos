'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/Card'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Users, UserCheck, AlertTriangle, Clock, FileSearch, ChevronUp, ChevronDown } from '@ultranos/ui-kit/icons'
import { Input } from '@ultranos/ui-kit/components/ui/input'
import { formatDate, formatRelativeTime } from '@ultranos/ui-kit'
import { db } from '@/lib/db'
import type { LocalPatient } from '@/lib/db'
import { usePatientListSync } from '@/lib/use-patient-list-sync'

type SortField = 'name' | 'age' | 'gender' | 'phone' | 'lastVisit' | 'status' | 'lastUpdated'
type SortDir = 'asc' | 'desc'
type StatusFilter = 'all' | 'active' | 'inactive'
type AllergyFilter = 'all' | 'yes' | 'no'
type VisitFilter = 'all' | 'today' | 'week' | 'month'

interface PatientRow {
  id: string
  name: string
  nameSegments: string[]
  age: number | null
  gender: string
  phone: string
  lastVisit: string | null
  status: string
  hasAllergies: boolean
  hasNationalId: boolean
  lastUpdated: string | null
}

const PAGE_SIZE = 25

function calculateAge(birthDate?: string, birthYear?: number): number | null {
  const now = new Date()
  if (birthDate) {
    const birth = new Date(birthDate)
    let age = now.getFullYear() - birth.getFullYear()
    const monthDiff = now.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      age--
    }
    return age
  }
  if (birthYear) {
    return now.getFullYear() - birthYear
  }
  return null
}

function getPatientName(patient: LocalPatient): string {
  const given = patient._ultranos?.nameGiven ?? patient.name?.[0]?.given?.[0] ?? ''
  const father = patient._ultranos?.nameFather ?? ''
  return [given, father].filter(Boolean).join(' ') || patient._ultranos?.nameLocal || ''
}

// Name parts for ring-separated display (given, father). Falls back to the
// joined nameLocal when neither part is present. The joined `name` string above
// is kept for search/sort.
function getPatientNameSegments(patient: LocalPatient): string[] {
  const given = patient._ultranos?.nameGiven ?? patient.name?.[0]?.given?.[0] ?? ''
  const father = patient._ultranos?.nameFather ?? ''
  const segments = [given, father].filter(Boolean) as string[]
  if (segments.length > 0) return segments
  const local = patient._ultranos?.nameLocal ?? ''
  return local ? [local] : []
}

function getPatientPhone(patient: LocalPatient): string {
  const phoneTelecom = patient.telecom?.find((t) => t.system === 'phone')
  return phoneTelecom?.value ?? ''
}

/** Latest of two ISO timestamps (either may be missing). */
function latestIso(a?: string | null, b?: string | null): string | null {
  if (a && b) return a > b ? a : b
  return a ?? b ?? null
}

export function PatientDirectory() {
  const t = useTranslations('patients')
  const router = useRouter()
  const locale = useLocale()

  const [patients, setPatients] = useState<LocalPatient[]>([])
  const [allergyPatientIds, setAllergyPatientIds] = useState<Set<string>>(new Set())
  const [lastVisitMap, setLastVisitMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const { syncAll, cancel: cancelSync } = usePatientListSync()

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [allergyFilter, setAllergyFilter] = useState<AllergyFilter>('all')
  const [visitFilter, setVisitFilter] = useState<VisitFilter>('all')

  // Sort
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Pagination
  const [page, setPage] = useState(1)

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Read patients + allergy/encounter aux data from local IndexedDB. Reused on
  // mount, after the Hub sync, and on tab re-focus so the allergy column and
  // last-visit always reflect the latest local state (e.g. allergies pulled
  // while a patient chart was open).
  const refreshFromDexie = useCallback(async () => {
    try {
      const [allPatients, allergies, encounters] = await Promise.all([
        db.patients.toArray(),
        db.allergyIntolerances.toArray(),
        db.encounters.toArray(),
      ])
      setPatients(allPatients)

      // Which patients have any allergy — patient.reference is "Patient/<id>".
      const allergyIds = new Set<string>()
      for (const a of allergies) {
        const ref = (a as { patient?: { reference?: string } }).patient?.reference
        if (ref) allergyIds.add(ref.replace('Patient/', ''))
      }
      setAllergyPatientIds(allergyIds)

      // Latest visit per patient from encounters.
      const visitMap = new Map<string, string>()
      for (const enc of encounters) {
        const ref = (enc as { subject?: { reference?: string } }).subject?.reference
        if (!ref) continue
        const pid = ref.replace('Patient/', '')
        // Use the encounter's actual visit datetime (period.start, ISO) — NOT
        // the HLC clock string, which is not a parseable date ("Invalid Date").
        const ts = (enc as { period?: { start?: string } }).period?.start
          ?? (enc as { meta?: { lastUpdated?: string } }).meta?.lastUpdated
          ?? ''
        if (!ts) continue
        const existing = visitMap.get(pid)
        if (!existing || ts > existing) visitMap.set(pid, ts)
      }
      setLastVisitMap(visitMap)
    } catch {
      // Encryption key not available or Dexie error — keep current state.
    }
  }, [])

  // Initial load on mount.
  useEffect(() => {
    let cancelled = false
    refreshFromDexie().finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [refreshFromDexie])

  // Refresh local-derived columns when the tab regains focus — covers data
  // (allergies/encounters) pulled into Dexie while the user was on a chart.
  useEffect(() => {
    function onResume() {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void refreshFromDexie()
    }
    window.addEventListener('focus', onResume)
    document.addEventListener('visibilitychange', onResume)
    return () => {
      window.removeEventListener('focus', onResume)
      document.removeEventListener('visibilitychange', onResume)
    }
  }, [refreshFromDexie])

  // Background Hub sync — fetch all patients and refresh local list
  useEffect(() => {
    let cancelled = false
    setSyncing(true)

    syncAll()
      .then(async (hubPatients) => {
        if (cancelled || hubPatients.length === 0) return
        // Re-read patients AND allergy/encounter aux data so the allergy column
        // and last-visit reflect anything pulled during/after the patient sync.
        await refreshFromDexie()
      })
      .finally(() => {
        if (!cancelled) setSyncing(false)
      })

    return () => {
      cancelled = true
      cancelSync()
    }
  }, [syncAll, cancelSync, refreshFromDexie])

  // Build rows
  const rows: PatientRow[] = useMemo(() => {
    return patients.map((p) => ({
      id: p.id,
      name: getPatientName(p),
      nameSegments: getPatientNameSegments(p),
      age: calculateAge(p.birthDate, p._ultranos?.birthYear),
      gender: p.gender ?? '',
      phone: getPatientPhone(p),
      // Prefer the most recent of the Hub list summary (covers all patients) and
      // the local per-patient cache (covers patients opened on this device).
      lastVisit: latestIso(lastVisitMap.get(p.id), p._ultranos?.lastVisitAt),
      status: p._ultranos?.isActive !== false ? 'active' : 'inactive',
      hasAllergies: allergyPatientIds.has(p.id) || (p._ultranos?.hasAllergies ?? false),
      hasNationalId: !!p._ultranos?.nationalIdHash,
      lastUpdated: (p.meta?.lastUpdated as string) ?? null,
    }))
  }, [patients, allergyPatientIds, lastVisitMap])

  // Stat counts derived from already-loaded rows (no new fetch)
  // - total: all patients
  // - active: patients with isActive !== false
  // - withAllergies: patients flagged with hasAllergies
  // - recentlyUpdated: patients whose meta.lastUpdated is more recent than lastVisit.
  //   This is "modified more recently than their last visit" — NOT a sync-queue metric.
  const stats = useMemo(() => {
    const total = rows.length
    const active = rows.filter((r) => r.status === 'active').length
    const withAllergies = rows.filter((r) => r.hasAllergies).length
    const recentlyUpdated = rows.filter(
      (r) => r.lastUpdated && (!r.lastVisit || r.lastUpdated > r.lastVisit)
    ).length
    return { total, active, withAllergies, recentlyUpdated }
  }, [rows])

  // Filter
  const filtered = useMemo(() => {
    let result = rows

    // Text search
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.phone.toLowerCase().includes(q)
      )
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((r) => r.status === statusFilter)
    }

    // Allergy filter
    if (allergyFilter === 'yes') {
      result = result.filter((r) => r.hasAllergies)
    } else if (allergyFilter === 'no') {
      result = result.filter((r) => !r.hasAllergies)
    }

    // Visit filter
    if (visitFilter !== 'all') {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      result = result.filter((r) => {
        if (!r.lastVisit) return false
        if (visitFilter === 'today') return r.lastVisit >= startOfDay
        if (visitFilter === 'week') return r.lastVisit >= startOfWeek
        if (visitFilter === 'month') return r.lastVisit >= startOfMonth
        return true
      })
    }

    return result
  }, [rows, debouncedSearch, statusFilter, allergyFilter, visitFilter])

  // Sort
  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      let cmp = 0
      const valA = a[sortField]
      const valB = b[sortField]

      if (valA == null && valB == null) cmp = 0
      else if (valA == null) cmp = 1
      else if (valB == null) cmp = -1
      else if (typeof valA === 'number' && typeof valB === 'number') cmp = valA - valB
      else if (typeof valA === 'boolean' && typeof valB === 'boolean') cmp = Number(valA) - Number(valB)
      else cmp = String(valA).localeCompare(String(valB))

      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [filtered, sortField, sortDir])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortDir('asc')
      return field
    })
    setPage(1)
  }, [])

  const handleRowClick = useCallback(
    (id: string) => {
      router.push(`/${locale}/patient/${id}`)
    },
    [router, locale]
  )

  const handleRegisterNew = useCallback(() => {
    router.push(`/${locale}/register-patient`)
  }, [router, locale])

  const handleClearFilters = useCallback(() => {
    setSearchQuery('')
    setStatusFilter('all')
    setAllergyFilter('all')
    setVisitFilter('all')
    setPage(1)
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">{t('title')}...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">
            {t('title')}
          </h1>
          {syncing && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              {t('syncing')}
            </span>
          )}
        </div>
        <Button variant="primary" onClick={handleRegisterNew}>
          {t('registerNew')}
        </Button>
      </div>

      {/* Stat strip — derived from already-loaded patient rows */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="stat-strip">
          <Card>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{t('statTotal')}</p>
              <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground" data-testid="stat-total">{stats.total}</p>
          </Card>
          <Card>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{t('statActive')}</p>
              <UserCheck className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground" data-testid="stat-active">{stats.active}</p>
          </Card>
          <Card>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{t('statWithAllergies')}</p>
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground" data-testid="stat-allergies">{stats.withAllergies}</p>
          </Card>
          <Card>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{t('statRecentlyUpdated')}</p>
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground" data-testid="stat-recently-updated">{stats.recentlyUpdated}</p>
          </Card>
        </div>
      )}

      {/* Status pill tab-bar + secondary filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status pill tab-bar */}
        <div className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {(['all', 'active', 'inactive'] as StatusFilter[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => { setStatusFilter(tab); setPage(1) }}
              className={[
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                statusFilter === tab
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
              aria-pressed={statusFilter === tab}
            >
              {t(tab as 'all' | 'active' | 'inactive')}
            </button>
          ))}
        </div>

        {/* Search */}
        <Input
          type="text"
          dir="auto"
          placeholder={t('searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="min-w-[200px] flex-1"
          aria-label={t('searchPlaceholder')}
        />

        {/* Secondary filters */}
        <select
          value={allergyFilter}
          onChange={(e) => { setAllergyFilter(e.target.value as AllergyFilter); setPage(1) }}
          className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
          aria-label={t('hasAllergies')}
        >
          <option value="all">{t('hasAllergies')}: {t('all')}</option>
          <option value="yes">{t('hasAllergies')}: {t('yes')}</option>
          <option value="no">{t('hasAllergies')}: {t('no')}</option>
        </select>

        <select
          value={visitFilter}
          onChange={(e) => { setVisitFilter(e.target.value as VisitFilter); setPage(1) }}
          className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
          aria-label={t('lastVisitFilter')}
        >
          <option value="all">{t('lastVisitFilter')}: {t('all')}</option>
          <option value="today">{t('lastVisitFilter')}: {t('today')}</option>
          <option value="week">{t('lastVisitFilter')}: {t('thisWeek')}</option>
          <option value="month">{t('lastVisitFilter')}: {t('thisMonth')}</option>
        </select>
      </div>

      {/* Empty states */}
      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('noPatients')}
          description={t('noPatientsDescription')}
          action={{ label: t('registerNew'), onClick: handleRegisterNew }}
        />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={FileSearch}
          title={t('noResults')}
          description={t('noResultsDescription')}
          action={{ label: t('clearFilters'), onClick: handleClearFilters }}
        />
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-xl ring-[0.65px] ring-border/50">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  {(
                    [
                      ['name', t('name')],
                      ['age', t('age')],
                      ['gender', t('gender')],
                      ['phone', t('phone')],
                      ['lastVisit', t('lastVisit')],
                      ['status', t('status')],
                      ['lastUpdated', t('lastUpdatedCol')],
                    ] as [SortField, string][]
                  ).map(([field, label]) => (
                    <th
                      key={field}
                      className="cursor-pointer px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
                      onClick={() => handleSort(field)}
                      aria-sort={sortField === field ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      {label}
                      {sortField === field && (
                        sortDir === 'asc'
                          ? <ChevronUp className="ms-1 inline-block h-3.5 w-3.5 align-middle" aria-hidden="true" />
                          : <ChevronDown className="ms-1 inline-block h-3.5 w-3.5 align-middle" aria-hidden="true" />
                      )}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t('allergies')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-background">
                {paginated.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => handleRowClick(row.id)}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    data-testid={`patient-row-${row.id}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">
                      <span className="flex items-center gap-2">
                        <span>
                          {row.nameSegments.length > 0 ? row.nameSegments.join(' ') : row.name}
                        </span>
                        {!row.hasNationalId && (
                          <span className="inline-flex rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-warning">
                            {t('nidMissingBadge')}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                      {row.age ?? '·'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                      {row.gender}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground" dir="ltr">
                      {row.phone || '·'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                      {row.lastVisit
                        ? formatDate(row.lastVisit, locale as 'en' | 'ar' | 'prs' | 'ps')
                        : '·'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                          row.status === 'active'
                            ? 'bg-success/20 text-success'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {row.status === 'active' ? t('active') : t('inactive')}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                      {row.lastUpdated
                        ? formatRelativeTime(row.lastUpdated, locale as 'en' | 'ar' | 'prs')
                        : '·'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {row.hasAllergies && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-semibold text-destructive"
                          aria-label={t('allergyFlag')}
                        >
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          {t('allergyFlag')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                {t('previous')}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('pageOf', { current: page, total: totalPages })}
              </span>
              <Button variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                {t('next')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
