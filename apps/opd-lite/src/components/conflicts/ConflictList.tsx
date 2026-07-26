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
import { Alert } from '@ultranos/ui-kit/components/ui/alert'
import { Skeleton } from '@ultranos/ui-kit/components/ui/skeleton'
import { ConflictDiffView } from './ConflictDiffView'

export function ConflictList() {
  const locale = useLocale() as 'en' | 'ar' | 'prs' | 'ps'
  const t = useTranslations('conflicts')
  const [conflicts, setConflicts] = useState<SyncQueueEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

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

  if (loading) {
    return (
      <div className="space-y-3" aria-label={t('loadingConflicts')} aria-busy="true">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    )
  }

  if (loadError) {
    return (
      <Alert
        variant="destructive"
        data-testid="conflict-load-error"
        role="alert"
        title={t('unableToLoadTitle')}
      >
        <p className="text-xs">{t('unableToLoadDetail')}</p>
      </Alert>
    )
  }

  if (conflicts.length === 0) {
    return (
      <div className="rounded-xl bg-card p-8 shadow-sm ring-[0.65px] ring-border/50 text-center" data-testid="no-conflicts">
        <CircleCheck className="mx-auto h-12 w-12 text-success" />
        <p className="mt-3 text-sm font-semibold text-foreground">{t('noUnresolved')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('noUnresolvedDetail')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="conflict-list">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          {t('unresolvedCount', { count: conflicts.length })}
        </p>
      </div>

      {conflicts.map((entry) => {
        const overdue = isConflictOverdue(entry.createdAt)
        const isExpanded = expandedId === entry.id
        const shortId = entry.resourceId.slice(0, 8)
        const patientShortId = entry.patientRef
          ? entry.patientRef.replace('Patient/', '').slice(0, 8)
          : t('resourceDefault')

        return (
          <div
            key={entry.id}
            className={`rounded-xl border bg-background shadow-sm transition-colors ${
              overdue
                ? 'border-destructive/30 bg-destructive/10'
                : 'border-border'
            }`}
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
  )
}
