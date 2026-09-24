'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { ExportButton } from '@/components/ExportButton'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/search-input'
import { EmptyState } from '@/components/ui/empty-state'
import { FileText, FileSearch, ChevronDown } from '@ultranos/ui-kit/icons'

interface AuditEvent {
  id: string
  timestamp: string
  action: string
  actorId: string
  actorName: string
  actorRole: string
  resourceType: string
  resourceId: string
  outcome: 'SUCCESS' | 'FAILURE'
  metadata: Record<string, unknown>
}

type ActionGroup =
  | 'ALL'
  | 'KYC_ACTIONS'
  | 'LAB_ACTIONS'
  | 'USER_ACTIONS'
  | 'ALERT_ACTIONS'
  | 'AUTH_EVENTS'
  | 'SETTINGS_CHANGES'

type OutcomeFilter = 'ALL' | 'SUCCESS' | 'FAILURE'

const ACTION_GROUPS: ActionGroup[] = [
  'ALL',
  'KYC_ACTIONS',
  'LAB_ACTIONS',
  'USER_ACTIONS',
  'ALERT_ACTIONS',
  'AUTH_EVENTS',
  'SETTINGS_CHANGES',
]
/** i18n key suffix for each action group (audit.actionGroup*). */
const ACTION_GROUP_KEY: Record<ActionGroup, string> = {
  ALL: 'actionGroupAll',
  KYC_ACTIONS: 'actionGroupKyc',
  LAB_ACTIONS: 'actionGroupLab',
  USER_ACTIONS: 'actionGroupUser',
  ALERT_ACTIONS: 'actionGroupAlert',
  AUTH_EVENTS: 'actionGroupAuth',
  SETTINGS_CHANGES: 'actionGroupSettings',
}
const PAGE_SIZE = 50

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getDefaultDateFrom(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

function getDefaultDateTo(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Render a metadata value for display. Redaction is performed SERVER-side
 * (admin.sanitizeMetadata) for both this viewer and the CSV export, so values arrive
 * already redacted — the client renders them verbatim (nested objects are stringified).
 */
function renderMetadataValue(value: unknown): string {
  if (value !== null && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const t = useTranslations('audit')
  if (outcome === 'SUCCESS') {
    return (
      <span className="inline-block rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
        {t('outcomeSuccess')}
      </span>
    )
  }
  return (
    <span className="inline-block rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
      {t('outcomeDenied')}
    </span>
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-block rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {role}
    </span>
  )
}

export function EventBrowser() {
  const t = useTranslations('audit')
  const tp = useTranslations('pagination')
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [dateFrom, setDateFrom] = useState(getDefaultDateFrom)
  const [dateTo, setDateTo] = useState(getDefaultDateTo)
  const [actionGroup, setActionGroup] = useState<ActionGroup>('ALL')
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('ALL')
  const [actorSearch, setActorSearch] = useState('')
  // Debounced actor search actually sent to the server (avoids a query per keystroke).
  const [actorQuery, setActorQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const selectedOutcome =
    outcomeFilter === 'ALL' ? undefined : outcomeFilter

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.listAuditEvents.query({
        cursor: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        startDate: `${dateFrom}T00:00:00.000Z`,
        endDate: `${dateTo}T23:59:59.999Z`,
        ...(actionGroup !== 'ALL' && { actionGroup }),
        ...(actorQuery && { actorSearch: actorQuery }),
        ...(selectedOutcome && { outcome: selectedOutcome as 'SUCCESS' | 'FAILURE' }),
      })
      setEvents(result.events as AuditEvent[])
      setTotalCount(result.total)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('loadEventsError'))
    } finally {
      setLoading(false)
    }
  }, [page, dateFrom, dateTo, outcomeFilter, actionGroup, actorQuery])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  // Debounce the actor search box → server query, resetting to page 1.
  useEffect(() => {
    const id = setTimeout(() => {
      setActorQuery(actorSearch.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(id)
  }, [actorSearch])

  function handleFilterChange<T>(setter: (v: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  // Filtering (action group, actor, outcome, dates) is applied server-side; the
  // returned rows are already the filtered result set for the current page.
  const filtersActive =
    actionGroup !== 'ALL' || actorQuery.length > 0 || outcomeFilter !== 'ALL'

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            placeholder={t('searchActorPlaceholder')}
            value={actorSearch}
            onChange={(e) => setActorSearch(e.target.value)}
            className="min-w-[200px] flex-1"
            inputClassName="h-9 rounded-full"
            aria-label={t('searchActorPlaceholder')}
          />

          {/* Date range */}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => handleFilterChange(setDateFrom)(e.target.value)}
            className="h-9 rounded-full border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label={t('dateFrom')}
          />
          <span className="text-sm text-muted-foreground">{t('dateRangeTo')}</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => handleFilterChange(setDateTo)(e.target.value)}
            className="h-9 rounded-full border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label={t('dateTo')}
          />

          <div className="relative">
            <select
              value={actionGroup}
              onChange={(e) => handleFilterChange(setActionGroup)(e.target.value as ActionGroup)}
              className="h-9 w-full appearance-none rounded-full border border-border bg-background text-foreground ps-3 pe-9 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label={t('filterByActionType')}
            >
              {ACTION_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {t(ACTION_GROUP_KEY[g])}
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>

          <div className="relative">
            <select
              value={outcomeFilter}
              onChange={(e) => handleFilterChange(setOutcomeFilter)(e.target.value as OutcomeFilter)}
              className="h-9 w-full appearance-none rounded-full border border-border bg-background text-foreground ps-3 pe-9 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label={t('filterByOutcome')}
            >
              <option value="ALL">{t('allOutcomes')}</option>
              <option value="SUCCESS">{t('outcomeSuccess')}</option>
              <option value="FAILURE">{t('outcomeFilterFailure')}</option>
            </select>
            <ChevronDown size={16} aria-hidden className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>

        <ExportButton
          exportFn={() =>
            trpc.admin.exportAuditEvents.query({
              startDate: `${dateFrom}T00:00:00.000Z`,
              endDate: `${dateTo}T23:59:59.999Z`,
              ...(actionGroup !== 'ALL' && { actionGroup }),
              ...(actorQuery && { actorSearch: actorQuery }),
              ...(selectedOutcome && { outcome: selectedOutcome as 'SUCCESS' | 'FAILURE' }),
            })
          }
          filters={{}}
        />
      </div>

      {error && (
        <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
      {loading ? (
        <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">{t('loadingEvents')}</div>
      ) : events.length === 0 ? (
        <div className="flex min-h-[16rem] items-center justify-center">
          <EmptyState
            icon={filtersActive ? FileSearch : FileText}
            title={t('noEvents')}
            description={t('noEventsDescription')}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colTimestamp')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colAction')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colActor')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colResource')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colOutcome')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    expanded={expandedId === event.id}
                    onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && events.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {tp('showing', { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, totalCount), total: totalCount })}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
              >
                {tp('previous')}
              </Button>
              <span className="flex items-center px-2">{tp('pageOf', { page, totalPages })}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
              >
                {tp('next')}
              </Button>
            </div>
          </div>
      )}
    </div>
  )
}

function EventRow({
  event,
  expanded,
  onToggle,
}: {
  event: AuditEvent
  expanded: boolean
  onToggle: () => void
}) {
  const metadataEntries = Object.entries(event.metadata ?? {})

  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer transition-colors hover:bg-muted/50"
      >
        <td className="px-4 py-3 text-muted-foreground font-numeric">{formatTimestamp(event.timestamp)}</td>
        <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{event.action}</td>
        <td className="px-4 py-3">
          <span className="font-medium text-foreground">{event.actorName}</span>
          <span className="ms-2"><RoleBadge role={event.actorRole} /></span>
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {event.resourceType}
          <span className="ms-1 font-mono text-xs">{event.resourceId.slice(0, 8)}...</span>
        </td>
        <td className="px-4 py-3"><OutcomeBadge outcome={event.outcome} /></td>
      </tr>
      {expanded && metadataEntries.length > 0 && (
        <tr>
          <td colSpan={5} className="bg-card px-8 py-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {metadataEntries.map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <span className="font-medium text-muted-foreground">{key}:</span>
                  <span className="text-foreground">
                    {renderMetadataValue(value)}
                  </span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
