'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { formatRelativeTime } from '@ultranos/ui-kit'
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

function getPatientPhone(patient: LocalPatient): string {
  const phoneTelecom = patient.telecom?.find((t) => t.system === 'phone')
  return phoneTelecom?.value ?? ''
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

  // Load data on mount
  useEffect(() => {
    let cancelled = false
    async function loadData() {
      try {
        const allPatients = await db.patients.toArray()
        if (cancelled) return
        setPatients(allPatients)

        // Load allergy data — we only need to know which patients have any
        const allergies = await db.allergyIntolerances.toArray()
        if (cancelled) return
        const allergyIds = new Set<string>()
        for (const a of allergies) {
          // patient.reference is "Patient/<id>"
          const ref = (a as { patient?: { reference?: string } }).patient?.reference
          if (ref) {
            const pid = ref.replace('Patient/', '')
            allergyIds.add(pid)
          }
        }
        setAllergyPatientIds(allergyIds)

        // Load last visit dates from encounters
        const encounters = await db.encounters.toArray()
        if (cancelled) return
        const visitMap = new Map<string, string>()
        for (const enc of encounters) {
          const ref = (enc as { subject?: { reference?: string } }).subject?.reference
          if (!ref) continue
          const pid = ref.replace('Patient/', '')
          const ts = (enc as { _ultranos?: { hlcTimestamp?: string } })._ultranos?.hlcTimestamp
            ?? (enc as { meta?: { lastUpdated?: string } }).meta?.lastUpdated
            ?? ''
          const existing = visitMap.get(pid)
          if (!existing || ts > existing) {
            visitMap.set(pid, ts)
          }
        }
        setLastVisitMap(visitMap)
      } catch {
        // Encryption key not available or Dexie error — show empty state gracefully
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadData()
    return () => { cancelled = true }
  }, [])

  // Background Hub sync — fetch all patients and refresh local list
  useEffect(() => {
    let cancelled = false
    setSyncing(true)

    syncAll()
      .then(async (hubPatients) => {
        if (cancelled || hubPatients.length === 0) return
        // Re-read from IndexedDB to pick up merged Hub data
        const refreshed = await db.patients.toArray()
        if (!cancelled) setPatients(refreshed)
      })
      .finally(() => {
        if (!cancelled) setSyncing(false)
      })

    return () => {
      cancelled = true
      cancelSync()
    }
  }, [syncAll, cancelSync])

  // Build rows
  const rows: PatientRow[] = useMemo(() => {
    return patients.map((p) => ({
      id: p.id,
      name: getPatientName(p),
      age: calculateAge(p.birthDate, p._ultranos?.birthYear),
      gender: p.gender ?? '',
      phone: getPatientPhone(p),
      lastVisit: lastVisitMap.get(p.id) ?? null,
      status: p._ultranos?.isActive !== false ? 'active' : 'inactive',
      hasAllergies: allergyPatientIds.has(p.id),
      hasNationalId: !!p._ultranos?.nationalIdHash,
      lastUpdated: (p.meta?.lastUpdated as string) ?? null,
    }))
  }, [patients, allergyPatientIds, lastVisitMap])

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

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">{t('title')}...</p>
      </div>
    )
  }

  const showRegisterButton = sorted.length < 3

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">
            {t('title')}
          </h1>
          {syncing && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              {t('syncing')}
            </span>
          )}
        </div>
        {showRegisterButton && (
          <Link
            href={`/${locale}/register-patient`}
            className="inline-flex items-center justify-center rounded-pill bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            {t('registerNew')}
          </Link>
        )}
      </div>

      {/* Search and Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder={t('searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="min-w-[200px] flex-1 rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label={t('searchPlaceholder')}
        />

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setPage(1) }}
          className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
          aria-label={t('status')}
        >
          <option value="all">{t('all')}</option>
          <option value="active">{t('active')}</option>
          <option value="inactive">{t('inactive')}</option>
        </select>

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
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border py-16">
          <p className="mb-2 text-lg font-medium text-foreground">
            {t('noPatients')}
          </p>
          <p className="mb-6 text-sm text-muted-foreground">
            {t('noPatientsDescription')}
          </p>
          <Link
            href={`/${locale}/register-patient`}
            className="inline-flex items-center justify-center rounded-pill bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            {t('registerNew')}
          </Link>
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border py-16">
          <p className="text-lg font-medium text-foreground">
            {t('noResults')}
          </p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-border">
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
                    >
                      {label}
                      {sortField === field && (
                        <span className="ms-1">
                          {sortDir === 'asc' ? '\u2191' : '\u2193'}
                        </span>
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
                        {row.name}
                        {!row.hasNationalId && (
                          <span className="inline-flex rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-warning">
                            {t('nidMissingBadge')}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                      {row.age ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                      {row.gender}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground" dir="ltr">
                      {row.phone || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                      {row.lastVisit
                        ? new Date(row.lastVisit).toLocaleDateString()
                        : '—'}
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
                        : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {row.hasAllergies && (
                        <span
                          className="inline-block h-3 w-3 rounded-full bg-destructive"
                          aria-label={t('allergyFlag')}
                          role="img"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
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
