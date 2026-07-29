'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { ShieldAlert, FileSearch } from '@ultranos/ui-kit/icons'
import { useTranslations } from 'next-intl'
import { getHubApiUrl } from '@/lib/trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

type Tab = 'pending' | 'resolved'

interface DispenseReview {
  id: string
  dispense_id: string
  override_reason: string | null
  override_supervisor: string | null
  status: 'PENDING' | 'APPROVED' | 'FLAGGED'
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '---'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function truncateUuid(uuid: string): string {
  return uuid.length > 8 ? `${uuid.slice(0, 8)}...` : uuid
}

/**
 * Fetch dispense reviews from Hub API dispense_reviews tRPC endpoint.
 * Uses the same raw-fetch pattern as prescription-status-client.ts.
 *
 * NOTE: The Hub API tRPC router for dispenseReview may not exist yet.
 * If it returns 404 or errors, we surface the error gracefully.
 */
async function fetchDispenseReviews(
  statuses: string[],
  authToken: string,
  signal?: AbortSignal,
): Promise<DispenseReview[]> {
  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/dispenseReview.list'
  url.searchParams.set(
    'input',
    JSON.stringify({ json: { statuses } }),
  )

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    signal,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message = body?.error?.message ?? `Hub API error: ${res.status}`
    throw new Error(message)
  }

  const body = (await res.json()) as {
    result: { data: { json: DispenseReview[] } }
  }
  return body.result.data.json
}

/**
 * Update a dispense review status (Approve or Flag).
 *
 * TODO: Hub API endpoint dispenseReview.updateStatus does not exist yet.
 * This function is wired but will fail until the endpoint is implemented.
 */
async function updateDispenseReviewStatus(
  reviewId: string,
  newStatus: 'APPROVED' | 'FLAGGED',
  authToken: string,
): Promise<void> {
  const url = new URL(getHubApiUrl())
  url.pathname =
    url.pathname.replace(/\/$/, '') + '/dispenseReview.updateStatus'

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ json: { reviewId, status: newStatus } }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message = body?.error?.message ?? `Hub API error: ${res.status}`
    throw new Error(message)
  }
}

export function UnverifiedDispensesView() {
  const t = useTranslations('unverified')
  const [activeTab, setActiveTab] = useState<Tab>('pending')
  const [reviews, setReviews] = useState<DispenseReview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionInFlight, setActionInFlight] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const fetchReviews = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await useAuthSessionStore.getState().getAccessToken()
      if (!token) {
        setError('Authentication required.')
        return
      }
      const statuses =
        activeTab === 'pending' ? ['PENDING'] : ['APPROVED', 'FLAGGED']
      const data = await fetchDispenseReviews(statuses, token)
      setReviews(data)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t('error')
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [activeTab, t])

  useEffect(() => {
    fetchReviews()
  }, [fetchReviews])

  const handleAction = async (
    reviewId: string,
    action: 'APPROVED' | 'FLAGGED',
  ) => {
    try {
      const token = await useAuthSessionStore.getState().getAccessToken()
      if (!token) {
        setError('Authentication required.')
        return
      }
      setActionInFlight(reviewId)
      await updateDispenseReviewStatus(reviewId, action, token)
      // Refresh list after action
      await fetchReviews()
    } catch {
      // TODO: The dispenseReview.updateStatus endpoint likely does not exist yet.
      setError(t('reviewNotConnected'))
    } finally {
      setActionInFlight(null)
    }
  }

  const query = search.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      reviews.filter((r) => {
        if (!query) return true
        return [r.dispense_id, r.override_reason, r.override_supervisor, r.reviewed_by]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query)
      }),
    [reviews, query],
  )
  const filtersActive = query !== ''

  function clearFilters() {
    setSearch('')
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'pending', label: t('pending') },
    { key: 'resolved', label: t('resolved') },
  ]

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">
        {t('title')}
      </h1>

      {/* Toolbar: pending/resolved tabs + search — always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {TABS.map((tb) => (
            <button
              key={tb.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tb.key}
              onClick={() => setActiveTab(tb.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tb.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>
        <SearchInput
          type="text"
          dir="auto"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          aria-label={t('searchPlaceholder')}
        />
      </div>

      {/* Content panel — single cohesive box */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">
            {t('loading')}
          </div>
        ) : error ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-destructive">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={filtersActive ? FileSearch : ShieldAlert}
              title={filtersActive ? t('noResultsTitle') : t('noRecords')}
              description={filtersActive ? t('noResultsDescription') : undefined}
              action={filtersActive ? { label: t('clearFilters'), onClick: clearFilters } : undefined}
            />
          </div>
        ) : activeTab === 'pending' ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {t('date')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {t('dispenseId')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {t('reason')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {t('supervisor')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {/* Actions */}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="transition-colors hover:bg-muted/50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">
                      {formatDateTime(r.created_at)}
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-3 text-sm font-mono text-muted-foreground"
                      title={r.dispense_id}
                    >
                      {truncateUuid(r.dispense_id)}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {r.override_reason ?? '---'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">
                      {r.override_supervisor
                        ? truncateUuid(r.override_supervisor)
                        : '---'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        <Button
                          variant="default"
                          onClick={() => handleAction(r.id, 'APPROVED')}
                          disabled={actionInFlight === r.id}
                        >
                          {t('approve')}
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => handleAction(r.id, 'FLAGGED')}
                          disabled={actionInFlight === r.id}
                        >
                          {t('flag')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {t('date')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {t('dispenseId')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {t('reason')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {t('supervisor')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {t('status')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {t('reviewedBy')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {t('reviewedAt')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="transition-colors hover:bg-muted/50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">
                      {formatDateTime(r.created_at)}
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-3 text-sm font-mono text-muted-foreground"
                      title={r.dispense_id}
                    >
                      {truncateUuid(r.dispense_id)}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {r.override_reason ?? '---'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">
                      {r.override_supervisor
                        ? truncateUuid(r.override_supervisor)
                        : '---'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={
                          r.status === 'APPROVED'
                            ? 'text-success'
                            : 'text-destructive'
                        }
                      >
                        {r.status === 'APPROVED' ? t('approved') : t('flagged')}
                      </span>
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-3 text-sm font-mono text-muted-foreground"
                      title={r.reviewed_by ?? undefined}
                    >
                      {r.reviewed_by ? truncateUuid(r.reviewed_by) : '---'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">
                      {formatDateTime(r.reviewed_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
