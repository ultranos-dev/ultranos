'use client'

import { useState, useEffect, useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { formatDateTime } from '@ultranos/ui-kit'
import { CircleCheck, ChevronDown } from '@ultranos/ui-kit/icons'
import { db, type SyncQueueEntry } from '@/lib/db'
import { isTier1Resource, isConflictOverdue } from '@/lib/conflict-resolution'
import { auditPhiAccess, AuditAction } from '@/lib/audit'
import type { AuditResourceType } from '@/lib/audit'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { Alert } from '@ultranos/ui-kit/components/ui/alert'
import { Skeleton } from '@ultranos/ui-kit/components/ui/skeleton'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { ConflictDiffView } from './ConflictDiffView'

export function ConflictList() {
  const locale = useLocale() as 'en' | 'ar' | 'prs' | 'ps'
  const t = useTranslations('conflicts')
  const tCommon = useTranslations('common')
  const [conflicts, setConflicts] = useState<SyncQueueEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusTab, setStatusTab] = useState<'all' | 'overdue'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'AllergyIntolerance' | 'MedicationRequest' | 'Condition'>('all')

  const loadConflicts = useCallback(async () => {
    try {
      const all = await db.syncQueue.toArray()

      const tier1 = all.filter(
        (entry) =>
          entry.conflictFlag === true &&
          entry.status !== 'synced' &&
          isTier1Resource(entry.resourceType),
      )

      // Sort: overdue first, then by createdAt ascending (oldest first)
      tier1.sort((a, b) => {
        const aOverdue = isConflictOverdue(a.createdAt)
        const bOverdue = isConflictOverdue(b.createdAt)
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })

      setConflicts(tier1)
      setLoadError(false)
    } catch {
      setConflicts([])
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConflicts()
    const interval = setInterval(loadConflicts, 5_000)
    return () => clearInterval(interval)
  }, [loadConflicts])

  const handleExpand = useCallback((entryId: string) => {
    setExpandedId((prev) => (prev === entryId ? null : entryId))

    // Emit PHI READ audit outside state updater to avoid StrictMode double-fire
    // Read from current conflicts ref to avoid stale closure
    const entry = conflicts.find((c) => c.id === entryId)
    if (entry && expandedId !== entryId) {
      auditPhiAccess(
        AuditAction.READ,
        entry.resourceType as AuditResourceType,
        entry.resourceId,
        entry.patientRef?.replace('Patient/', ''),
        { phiAccess: 'conflict_review' },
      )
    }
  }, [conflicts, expandedId])

  const handleResolved = useCallback(() => {
    setExpandedId(null)
    loadConflicts()
  }, [loadConflicts])

  function resourceLabel(resourceType: string): string {
    if (resourceType === 'AllergyIntolerance') return t('resourceAllergy')
    if (resourceType === 'MedicationRequest') return t('resourceMedication')
    if (resourceType === 'Condition') return t('resourceDiagnosis')
    return t('resourceDefault')
  }

  function conflictAge(createdAt: string): string {
    const ageMs = Date.now() - new Date(createdAt).getTime()
    const hours = Math.floor(ageMs / (60 * 60 * 1000))
    if (hours < 1) return t('lessThanOneHour')
    if (hours < 24) return t('hoursAgo', { hours })
    const days = Math.floor(hours / 24)
    return t('daysHoursAgo', { days, hours: hours % 24 })
  }

  const query = search.trim().toLowerCase()
  const visible = conflicts.filter((entry) => {
    if (statusTab === 'overdue' && !isConflictOverdue(entry.createdAt)) return false
    if (typeFilter !== 'all' && entry.resourceType !== typeFilter) return false
    if (!query) return true
    const haystack = `${entry.resourceId} ${entry.patientRef ?? ''}`.toLowerCase()
    return haystack.includes(query)
  })

  return (
    <div className="flex flex-col gap-4" data-testid="conflict-list">
      {/* Toolbar: search + tab-bar + type filter (search-first golden order) */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          dir="auto"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          inputClassName="h-9 rounded-full"
          aria-label={t('searchPlaceholder')}
          searchLabel={tCommon('search')}
        />

        <div className="flex h-9 items-stretch gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {(['all', 'overdue'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusTab(tab)}
              className={`flex items-center rounded-full px-4 text-sm font-medium transition-colors ${
                statusTab === tab
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={statusTab === tab}
            >
              {tab === 'all' ? t('tabAll') : t('tabOverdue')}
            </button>
          ))}
        </div>

        <div className="relative">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="h-9 w-full appearance-none rounded-full border border-border bg-background text-foreground ps-3 pe-9 text-sm"
            aria-label={t('typeAll')}
          >
            <option value="all">{t('typeAll')}</option>
            <option value="AllergyIntolerance">{t('typeAllergy')}</option>
            <option value="MedicationRequest">{t('typeMedication')}</option>
            <option value="Condition">{t('typeDiagnosis')}</option>
          </select>
          <ChevronDown size={16} aria-hidden className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {!loading && !loadError && conflicts.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">
            {t('unresolvedCount', { count: visible.length })}
          </p>
        </div>
      )}

      <div
        className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50"
        data-testid="conflict-panel"
      >
        {loading ? (
          <div
            className="space-y-3 p-3"
            aria-label={t('loadingConflicts')}
            aria-busy="true"
          >
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : loadError ? (
          <div className="p-4">
            <Alert
              variant="destructive"
              data-testid="conflict-load-error"
              role="alert"
              title={t('unableToLoadTitle')}
            >
              <p className="text-xs">{t('unableToLoadDetail')}</p>
            </Alert>
          </div>
        ) : conflicts.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              data-testid="no-conflicts"
              icon={CircleCheck}
              title={t('noUnresolved')}
              description={t('noUnresolvedDetail')}
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={CircleCheck} title={t('noResults')} />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {visible.map((entry) => {
              const overdue = isConflictOverdue(entry.createdAt)
              const isExpanded = expandedId === entry.id
              const shortId = entry.resourceId.slice(0, 8)
              const patientShortId = entry.patientRef
                ? entry.patientRef.replace('Patient/', '').slice(0, 8)
                : t('resourceDefault')

              return (
                <div
                  key={entry.id}
                  className={`transition-colors ${overdue ? 'bg-destructive/10' : ''}`}
                  data-testid="conflict-item"
                >
            {/* Conflict summary row */}
            <Button
              variant="ghost"
              type="button"
              onClick={() => handleExpand(entry.id)}
              className="flex w-full items-center gap-3 ps-5 pe-5 py-4 text-start"
              aria-expanded={isExpanded}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {resourceLabel(entry.resourceType)}
                  </span>
                  <span className="text-xs text-muted-foreground">{t('idLabel', { id: shortId })}</span>
                  {overdue && (
                    <span
                      className="inline-flex items-center rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground"
                      data-testid="overdue-badge"
                    >
                      {t('overdue')}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{t('patientLabel', { id: patientShortId })}</span>
                  <span>{conflictAge(entry.createdAt)}</span>
                  <span>{formatDateTime(entry.createdAt, locale)}</span>
                </div>
              </div>

              {/* Chevron */}
              <ChevronDown
                className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
                  isExpanded ? 'rotate-180' : ''
                }`}
              />
            </Button>

            {/* Expanded diff view */}
            {isExpanded && (
              <div className="border-t border-border ps-5 pe-5 py-4">
                <ConflictDiffView entry={entry} onResolved={handleResolved} />
              </div>
            )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
