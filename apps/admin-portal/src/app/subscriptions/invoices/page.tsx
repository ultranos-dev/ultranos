'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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
  const variantMap: Record<InvoiceStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
    PAID: 'success',
    PENDING: 'warning',
    FAILED: 'destructive',
    REFUNDED: 'secondary',
  }

  return (
    <Badge variant={variantMap[status] ?? 'secondary'}>
      {status}
    </Badge>
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
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back to Subscriptions
        </Link>

        {/* Filter bar */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value as StatusFilter)}
            className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
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
          <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {loading ? (
          <div className="mt-6 text-muted-foreground">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-border bg-card p-12 text-center">
            <p className="text-lg font-medium text-foreground">No invoices yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Invoices will appear here once your first billing cycle completes.
            </p>
          </div>
        ) : (
          <>
            {/* Invoice table */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-card">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Date</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Description</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Amount</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-popover">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="transition-colors hover:bg-primary/5">
                      <td className="px-4 py-3 text-foreground">{formatDate(invoice.date)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{invoice.description}</td>
                      <td className="px-4 py-3 text-foreground font-medium">${invoice.amountUsd.toFixed(2)}</td>
                      <td className="px-4 py-3"><InvoiceStatusBadge status={invoice.status} /></td>
                      <td className="px-4 py-3">
                        <a
                          href={invoice.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-primary hover:underline"
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
              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Showing {(page - 1) * PAGE_SIZE + 1}&ndash;{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <span className="flex items-center px-2">Page {page} of {totalPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
