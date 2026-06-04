'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
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

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">
        {t('title')}
      </h1>

      {/* Tab switcher */}
      <div
        className="mt-4 flex gap-1 rounded-lg bg-neutral-100 p-1"
        role="tablist"
      >
        <button
          role="tab"
          aria-selected={activeTab === 'pending'}
          onClick={() => {
            setActiveTab('pending')
          }}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'pending'
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          {t('pending')}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'resolved'}
          onClick={() => {
            setActiveTab('resolved')
          }}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'resolved'
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          {t('resolved')}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="mt-6 py-12 text-center text-sm text-neutral-500">
          {t('loading')}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="mt-6 py-12 text-center text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && reviews.length === 0 && (
        <div className="mt-6 rounded-lg border border-neutral-200 px-4 py-12 text-center text-sm text-neutral-500">
          {t('noRecords')}
        </div>
      )}

      {/* Pending reviews table */}
      {!loading && !error && reviews.length > 0 && activeTab === 'pending' && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500"
                >
                  {t('date')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500"
                >
                  {t('dispenseId')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500"
                >
                  {t('reason')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500"
                >
                  {t('supervisor')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500"
                >
                  {/* Actions */}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {reviews.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-neutral-50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-700">
                    {formatDateTime(r.created_at)}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 text-sm font-mono text-neutral-600"
                    title={r.dispense_id}
                  >
                    {truncateUuid(r.dispense_id)}
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-700">
                    {r.override_reason ?? '---'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-700">
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
      )}

      {/* Resolved reviews table */}
      {!loading && !error && reviews.length > 0 && activeTab === 'resolved' && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500"
                >
                  {t('date')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500"
                >
                  {t('dispenseId')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500"
                >
                  {t('reason')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500"
                >
                  {t('supervisor')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500"
                >
                  {t('status')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500"
                >
                  {t('reviewedBy')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500"
                >
                  {t('reviewedAt')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {reviews.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-neutral-50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-700">
                    {formatDateTime(r.created_at)}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 text-sm font-mono text-neutral-600"
                    title={r.dispense_id}
                  >
                    {truncateUuid(r.dispense_id)}
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-700">
                    {r.override_reason ?? '---'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-700">
                    {r.override_supervisor
                      ? truncateUuid(r.override_supervisor)
                      : '---'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <span
                      className={
                        r.status === 'APPROVED'
                          ? 'text-green-700'
                          : 'text-red-700'
                      }
                    >
                      {r.status === 'APPROVED' ? t('approved') : t('flagged')}
                    </span>
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 text-sm font-mono text-neutral-600"
                    title={r.reviewed_by ?? undefined}
                  >
                    {r.reviewed_by ? truncateUuid(r.reviewed_by) : '---'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-700">
                    {formatDateTime(r.reviewed_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
