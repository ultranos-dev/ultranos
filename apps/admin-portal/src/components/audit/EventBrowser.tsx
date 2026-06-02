'use client'

import { useEffect, useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { ExportButton } from '@/components/ExportButton'

interface AuditEvent {
  id: string
  timestamp: string
  action: string
  actorId: string
  actorName: string
  actorRole: string
  resourceType: string
  resourceId: string
  outcome: 'SUCCESS' | 'DENIED'
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

type OutcomeFilter = 'ALL' | 'SUCCESS' | 'DENIED'

const ACTION_GROUP_LABELS: Record<ActionGroup, string> = {
  ALL: 'All Actions',
  KYC_ACTIONS: 'KYC Actions',
  LAB_ACTIONS: 'Lab Actions',
  USER_ACTIONS: 'User Actions',
  ALERT_ACTIONS: 'Alert Actions',
  AUTH_EVENTS: 'Auth Events',
  SETTINGS_CHANGES: 'Settings Changes',
}

const ACTION_GROUP_TYPES: Record<Exclude<ActionGroup, 'ALL'>, string[]> = {
  KYC_ACTIONS: ['KYC_APPROVED', 'KYC_REJECTED', 'KYC_MORE_INFO_REQUESTED'],
  LAB_ACTIONS: ['LAB_APPROVED', 'LAB_REJECTED', 'LAB_RESULT_SUBMITTED'],
  USER_ACTIONS: ['USER_CREATED', 'USER_UPDATED', 'USER_SUSPENDED', 'USER_REACTIVATED'],
  ALERT_ACTIONS: ['ALERT_ACKNOWLEDGED', 'ALERT_DISMISSED', 'ALERT_ESCALATED'],
  AUTH_EVENTS: ['LOGIN', 'LOGOUT', 'MFA_ENROLLED', 'MFA_VERIFIED', 'PASSWORD_RESET'],
  SETTINGS_CHANGES: ['SETTINGS_UPDATED', 'SUBSCRIPTION_CHANGED', 'PLAN_UPGRADED'],
}

const REDACTED_KEYS = ['patient', 'diagnosis', 'medication', 'allergy', 'note']

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

function shouldRedact(key: string): boolean {
  const lower = key.toLowerCase()
  return REDACTED_KEYS.some((k) => lower.includes(k))
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  if (outcome === 'SUCCESS') {
    return (
      <span className="inline-block rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
        SUCCESS
      </span>
    )
  }
  return (
    <span className="inline-block rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
      DENIED
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
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [dateFrom, setDateFrom] = useState(getDefaultDateFrom)
  const [dateTo, setDateTo] = useState(getDefaultDateTo)
  const [actionGroup, setActionGroup] = useState<ActionGroup>('ALL')
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('ALL')
  const [actorSearch, setActorSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const selectedActionTypes =
    actionGroup === 'ALL' ? undefined : ACTION_GROUP_TYPES[actionGroup]
  const selectedOutcome =
    outcomeFilter === 'ALL' ? undefined : outcomeFilter

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.listAuditEvents.query({
        page,
        pageSize: PAGE_SIZE,
        dateFrom,
        dateTo,
        ...(selectedActionTypes && { actionTypes: selectedActionTypes }),
        ...(actorSearch.trim() && { actorSearch: actorSearch.trim() }),
        ...(selectedOutcome && { outcome: selectedOutcome }),
      })
      setEvents(result.events)
      setTotalCount(result.totalCount)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load audit events')
    } finally {
      setLoading(false)
    }
  }, [page, dateFrom, dateTo, actionGroup, actorSearch, outcomeFilter])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  function handleFilterChange<T>(setter: (v: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="mt-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => handleFilterChange(setDateFrom)(e.target.value)}
            className="rounded-full border border-border bg-card px-4 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Date from"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => handleFilterChange(setDateTo)(e.target.value)}
            className="rounded-full border border-border bg-card px-4 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Date to"
          />

          <select
            value={actionGroup}
            onChange={(e) => handleFilterChange(setActionGroup)(e.target.value as ActionGroup)}
            className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Filter by action type"
          >
            {(Object.keys(ACTION_GROUP_LABELS) as ActionGroup[]).map((g) => (
              <option key={g} value={g}>
                {ACTION_GROUP_LABELS[g]}
              </option>
            ))}
          </select>

          <select
            value={outcomeFilter}
            onChange={(e) => handleFilterChange(setOutcomeFilter)(e.target.value as OutcomeFilter)}
            className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Filter by outcome"
          >
            <option value="ALL">All Outcomes</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="DENIED">DENIED</option>
          </select>

          <input
            type="text"
            placeholder="Search actor name..."
            value={actorSearch}
            onChange={(e) => handleFilterChange(setActorSearch)(e.target.value)}
            className="rounded-full border border-border bg-card px-4 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary w-52"
            aria-label="Search actor name"
          />
        </div>

        <ExportButton
          exportFn={() =>
            trpc.admin.exportAuditEvents.query({
              dateFrom,
              dateTo,
              actionTypes: selectedActionTypes,
              outcome: selectedOutcome,
              format: 'csv',
            })
          }
          filters={{}}
        />
      </div>

      {error && (
        <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {loading ? (
        <div className="mt-6 text-muted-foreground">Loading audit events...</div>
      ) : events.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-border bg-white p-12 text-center">
          <p className="text-lg font-medium text-foreground">No audit events found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting your filters or date range.
          </p>
        </div>
      ) : (
        <>
          {/* Events table */}
          <div className="mt-4 overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-black">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Timestamp</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Action</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Actor</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Resource</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-popover">
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

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-card hover:scale-[1.02] transition-transform duration-200"
              >
                Previous
              </button>
              <span className="flex items-center px-2">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-card hover:scale-[1.02] transition-transform duration-200"
              >
                Next
              </button>
            </div>
          </div>
        </>
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
        className="cursor-pointer transition-colors hover:bg-brand-lime/5"
      >
        <td className="px-4 py-3 text-muted-foreground">{formatTimestamp(event.timestamp)}</td>
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
                    {shouldRedact(key) ? '[redacted]' : String(value)}
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
