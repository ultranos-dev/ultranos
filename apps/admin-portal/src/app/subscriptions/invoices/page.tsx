'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'

type InvoiceStatus = 'PAID' | 'PENDING' | 'FAILED' | 'REFUNDED'
type StatusFilter = 'ALL' | InvoiceStatus

interface Invoice {
  id: string
  date: string
  description: string
  amountUsd: number
  status: InvoiceStatus
  downloadUrl: string
}

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const colorMap: Record<InvoiceStatus, string> = {
    PAID: 'bg-success-subtle text-success',
    PENDING: 'bg-warning-subtle text-warning',
    FAILED: 'bg-danger-subtle text-danger',
    REFUNDED: 'bg-surface text-text-secondary',
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-surface text-text-secondary'}`}>
      {status}
    </span>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'PAID', 'PENDING', 'FAILED', 'REFUNDED']
const STATUS_LABELS: Record<StatusFilter, string> = {
  ALL: 'All Statuses',
  PAID: 'Paid',
  PENDING: 'Pending',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
}
const PAGE_SIZE = 20

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.subscription.listInvoices.query({
        page,
        pageSize: PAGE_SIZE,
        ...(statusFilter !== 'ALL' && { statusFilter }),
      })
      setInvoices(result.invoices)
      setTotalCount(result.totalCount)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  function handleStatusFilterChange(newFilter: StatusFilter) {
    setStatusFilter(newFilter)
    setPage(1)
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <>
      <TopHeader title="Invoice History" />
      <div className="mx-auto max-w-7xl px-8 py-6">
        <Link
          href="/subscriptions"
          className="text-sm text-text-muted hover:text-black transition-colors"
        >
          &larr; Back to Subscriptions
        </Link>

        {/* Filter bar */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value as StatusFilter)}
            className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
        )}

        {loading ? (
          <div className="mt-6 text-text-secondary">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-border bg-white p-12 text-center">
            <p className="text-lg font-medium text-text-primary">No invoices yet</p>
            <p className="mt-1 text-sm text-text-muted">
              Invoices will appear here once your first billing cycle completes.
            </p>
          </div>
        ) : (
          <>
            {/* Invoice table */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-black">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Date</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Description</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Amount</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface-raised">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="transition-colors hover:bg-brand-lime/5">
                      <td className="px-4 py-3 text-text-primary">{formatDate(invoice.date)}</td>
                      <td className="px-4 py-3 text-text-muted">{invoice.description}</td>
                      <td className="px-4 py-3 text-text-primary font-medium">${invoice.amountUsd.toFixed(2)}</td>
                      <td className="px-4 py-3"><InvoiceStatusBadge status={invoice.status} /></td>
                      <td className="px-4 py-3">
                        <a
                          href={invoice.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-accent hover:underline"
                        >
                          Download PDF
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
                <span>
                  Showing {(page - 1) * PAGE_SIZE + 1}&ndash;{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
                  >
                    Previous
                  </button>
                  <span className="flex items-center px-2">Page {page} of {totalPages}</span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages}
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
