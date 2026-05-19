'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { ExportButton } from '@/components/ExportButton'

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
    PENDING_VERIFICATION: 'bg-warning-subtle text-warning',
    ACTIVE: 'bg-success-subtle text-success',
    REJECTED: 'bg-danger-subtle text-danger',
    REQUEST_MORE_INFO: 'bg-warning-subtle text-warning',
    SUSPENDED: 'bg-surface text-text-secondary',
  }

  const labelMap: Record<string, string> = {
    PENDING_VERIFICATION: 'Pending',
    ACTIVE: 'Active',
    REJECTED: 'Rejected',
    REQUEST_MORE_INFO: 'More Info',
    SUSPENDED: 'Suspended',
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-surface text-text-secondary'}`}>
      {labelMap[status] ?? status}
    </span>
  )
}

function SlaCountdown({ slaBreached, slaRemainingHours }: { slaBreached: boolean; slaRemainingHours: number | null }) {
  if (slaBreached) {
    return <span className="text-sm font-semibold text-danger">SLA Breached</span>
  }
  if (slaRemainingHours === null) {
    return <span className="text-sm text-text-secondary">—</span>
  }

  const days = Math.floor(slaRemainingHours / 24)
  const hours = slaRemainingHours % 24
  const isUrgent = slaRemainingHours < 24

  return (
    <span className={`text-sm font-medium ${isUrgent ? 'text-warning' : 'text-text-secondary'}`}>
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
  const [search, setSearch] = useState('')
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
        search: search || undefined,
      })
      setSubmissions(result.submissions)
      setTotal(result.total)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load KYC submissions')
    } finally {
      setLoading(false)
    }
  }, [filter, cursor, search])

  useEffect(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

  function handleFilterChange(newFilter: StatusFilter) {
    setFilter(newFilter)
    setCursor(0)
  }

  function handleSearchChange(value: string) {
    setSearch(value)
    setCursor(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(cursor / PAGE_SIZE) + 1

  return (
    <>
      <TopHeader title="KYC Verification Queue" description="Review pending provider KYC submissions." />
      <div className="mx-auto max-w-7xl px-8 py-6">
        {/* Filter tabs + Search + Export — AC #11 */}
        <div className="flex items-center gap-3">
          <div className="flex gap-1 rounded-full bg-surface p-1 w-fit">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => handleFilterChange(s)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  filter === s
                    ? 'bg-accent text-text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {FILTER_LABELS[s]}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="rounded-xl border border-border px-4 py-2 text-sm max-w-xs"
          />
          <ExportButton exportFn={() => trpc.admin.exportKycSubmissions.query()} filters={{}} />
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
        )}

        {loading ? (
          <div className="mt-6 text-text-secondary">Loading KYC submissions...</div>
        ) : submissions.length === 0 ? (
          <div className="mt-6 rounded-2xl border-2 border-dashed border-border p-8 text-center">
            <p className="text-text-secondary">No pending KYC submissions{filter !== 'ALL' ? ` matching filter "${FILTER_LABELS[filter]}"` : ''}.</p>
          </div>
        ) : (
          <>
            {/* KYC queue table — AC #1, #2, #7 */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary text-xs uppercase tracking-wide">Provider Name</th>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary text-xs uppercase tracking-wide">Submitted Date</th>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary text-xs uppercase tracking-wide">License Doc</th>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary text-xs uppercase tracking-wide">Registry Status</th>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary text-xs uppercase tracking-wide">SLA Countdown</th>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary text-xs uppercase tracking-wide">KYC Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface-raised">
                  {submissions.map((sub) => (
                    <tr
                      key={sub.submissionId}
                      onClick={() => router.push(`/providers/${sub.submissionId}`)}
                      className={`cursor-pointer transition-colors ${
                        sub.slaBreached
                          ? 'bg-danger-subtle hover:bg-danger-subtle'
                          : 'hover:bg-accent-subtle'
                      }`}
                    >
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/providers/profile/${sub.practitionerId}`}
                          className="text-black hover:text-brand-lime font-medium"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {sub.providerName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{formatDate(sub.submittedAt)}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {sub.licenseDocumentKey ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-text-primary">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                            View
                          </span>
                        ) : (
                          <span className="text-xs text-text-secondary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{sub.registryVerificationStatus ?? '—'}</td>
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
              <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
                <span>
                  Showing {cursor + 1}–{Math.min(cursor + PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCursor(Math.max(0, cursor - PAGE_SIZE))}
                    disabled={cursor === 0}
                    className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
                  >
                    Previous
                  </button>
                  <span className="flex items-center px-2">Page {currentPage} of {totalPages}</span>
                  <button
                    onClick={() => setCursor(cursor + PAGE_SIZE)}
                    disabled={cursor + PAGE_SIZE >= total}
                    className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
