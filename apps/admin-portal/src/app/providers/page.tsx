'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'

type StatusFilter = 'ALL' | 'PENDING' | 'SLA_BREACHED'

interface KycQueueEntry {
  submissionId: string
  practitionerId: string
  providerName: string
  submittedAt: string
  registryNumber: string
  registryVerificationStatus: string | null
  licenseDocumentKey: string | null
  kycStatus: string
  slaDeadline: string
  slaBreached: boolean
  slaRemainingHours: number | null
}

function KycStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    PENDING_VERIFICATION: 'bg-amber-100 text-amber-800',
    ACTIVE: 'bg-green-100 text-green-800',
    REJECTED: 'bg-red-100 text-red-800',
    REQUEST_MORE_INFO: 'bg-amber-100 text-amber-800',
    SUSPENDED: 'bg-neutral-100 text-neutral-600',
  }

  const labelMap: Record<string, string> = {
    PENDING_VERIFICATION: 'Pending',
    ACTIVE: 'Active',
    REJECTED: 'Rejected',
    REQUEST_MORE_INFO: 'More Info',
    SUSPENDED: 'Suspended',
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-neutral-100 text-neutral-600'}`}>
      {labelMap[status] ?? status}
    </span>
  )
}

function SlaCountdown({ slaBreached, slaRemainingHours }: { slaBreached: boolean; slaRemainingHours: number | null }) {
  if (slaBreached) {
    return <span className="text-sm font-semibold text-red-600">SLA Breached</span>
  }
  if (slaRemainingHours === null) {
    return <span className="text-sm text-neutral-400">—</span>
  }

  const days = Math.floor(slaRemainingHours / 24)
  const hours = slaRemainingHours % 24
  const isUrgent = slaRemainingHours < 24

  return (
    <span className={`text-sm font-medium ${isUrgent ? 'text-amber-600' : 'text-neutral-600'}`}>
      {days > 0 ? `${days}d ${hours}h` : `${hours}h`}
    </span>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'PENDING', 'SLA_BREACHED']
const FILTER_LABELS: Record<StatusFilter, string> = {
  ALL: 'All',
  PENDING: 'Pending',
  SLA_BREACHED: 'SLA Breached',
}
const PAGE_SIZE = 25

export default function KycQueuePage() {
  const router = useRouter()
  const [submissions, setSubmissions] = useState<KycQueueEntry[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [filter, setFilter] = useState<StatusFilter>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSubmissions = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.listKycSubmissions.query({
        status: filter,
        cursor,
        limit: PAGE_SIZE,
      })
      setSubmissions(result.submissions)
      setTotal(result.total)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load KYC submissions')
    } finally {
      setLoading(false)
    }
  }, [filter, cursor])

  useEffect(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

  function handleFilterChange(newFilter: StatusFilter) {
    setFilter(newFilter)
    setCursor(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(cursor / PAGE_SIZE) + 1

  return (
    <div className="max-w-6xl">
      <h1 className="text-4xl font-bold tracking-tight wavy-divider">KYC Verification Queue</h1>
      <p className="mt-4 text-text-muted">Review pending provider KYC submissions.</p>

      {/* Filter tabs — AC #11 */}
      <div className="mt-6 flex gap-1 rounded-full bg-black p-1 w-fit">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => handleFilterChange(s)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === s
                ? 'bg-brand-lime text-black'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            {FILTER_LABELS[s]}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="mt-6 text-neutral-500">Loading KYC submissions...</div>
      ) : submissions.length === 0 ? (
        <div className="mt-6 rounded-3xl border-2 border-dashed border-border p-8 text-center">
          <p className="text-text-muted">No pending KYC submissions{filter !== 'ALL' ? ` matching filter "${FILTER_LABELS[filter]}"` : ''}.</p>
        </div>
      ) : (
        <>
          {/* KYC queue table — AC #1, #2, #7 */}
          <div className="mt-4 overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-black">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Provider Name</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Submitted Date</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">License Doc</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Registry Status</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">SLA Countdown</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">KYC Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {submissions.map((sub) => (
                  <tr
                    key={sub.submissionId}
                    onClick={() => router.push(`/providers/${sub.submissionId}`)}
                    className={`cursor-pointer transition-colors ${
                      sub.slaBreached
                        ? 'bg-red-50 hover:bg-red-100'
                        : 'hover:bg-brand-lime/5'
                    }`}
                  >
                    <td className="px-4 py-3 font-medium">{sub.providerName}</td>
                    <td className="px-4 py-3 text-neutral-600">{formatDate(sub.submittedAt)}</td>
                    <td className="px-4 py-3 text-neutral-600">
                      {sub.licenseDocumentKey ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-black">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                          View
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{sub.registryVerificationStatus ?? '—'}</td>
                    <td className="px-4 py-3">
                      <SlaCountdown slaBreached={sub.slaBreached} slaRemainingHours={sub.slaRemainingHours} />
                    </td>
                    <td className="px-4 py-3"><KycStatusBadge status={sub.kycStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination — AC #12 */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
              <span>
                Showing {cursor + 1}–{Math.min(cursor + PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCursor(Math.max(0, cursor - PAGE_SIZE))}
                  disabled={cursor === 0}
                  className="rounded-full border border-black px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-neutral-50 hover:scale-[1.02] transition-all"
                >
                  Previous
                </button>
                <span className="flex items-center px-2">Page {currentPage} of {totalPages}</span>
                <button
                  onClick={() => setCursor(cursor + PAGE_SIZE)}
                  disabled={cursor + PAGE_SIZE >= total}
                  className="rounded-full border border-black px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-neutral-50 hover:scale-[1.02] transition-all"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
