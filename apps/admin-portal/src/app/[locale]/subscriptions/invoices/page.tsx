'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type ApiInvoiceStatus = 'PAID' | 'OPEN' | 'VOID' | 'UNCOLLECTIBLE'
type StatusFilter = 'ALL' | ApiInvoiceStatus

interface Invoice {
  invoiceId: string
  amount: number
  currency: string
  status: string
  pdfUrl: string | null
  createdAt: string
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const upper = status.toUpperCase()
  const variantMap: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
    PAID: 'success',
    OPEN: 'warning',
    VOID: 'secondary',
    UNCOLLECTIBLE: 'destructive',
  }

  return (
    <Badge variant={variantMap[upper] ?? 'secondary'}>
      {upper}
    </Badge>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100)
}

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'PAID', 'OPEN', 'VOID', 'UNCOLLECTIBLE']
const PAGE_SIZE = 20

export default function InvoicesPage() {
  const t = useTranslations('subscriptions')

  const STATUS_LABELS: Record<StatusFilter, string> = {
    ALL: t('invoicesFilterAll'),
    PAID: t('invoicesFilterPaid'),
    OPEN: t('invoicesFilterOpen'),
    VOID: t('invoicesFilterVoid'),
    UNCOLLECTIBLE: t('invoicesFilterUncollectible'),
  }

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
        cursor: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        status: statusFilter,
      })
      setInvoices(result.invoices)
      setTotalCount(result.totalCount)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('invoicesErrorLoad'))
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
    <div className="flex flex-col gap-4">
        <Link
          href="/subscriptions"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('invoicesBack')}
        </Link>

        {/* Filter bar */}
        <div className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => handleStatusFilterChange(s)}
              className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {loading ? (
          <div className="text-muted-foreground">{t('invoicesLoading')}</div>
        ) : invoices.length === 0 ? (
          <div className="rounded-3xl border border-border bg-card p-12 text-center">
            <p className="text-lg font-medium text-foreground">{t('invoicesNoInvoices')}</p>
          </div>
        ) : (
          <>
            {/* Invoice table */}
            <div className="overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-card">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('invoicesColDate')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('invoicesColAmount')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('invoicesColStatus')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('invoicesColAction')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-popover">
                  {invoices.map((invoice) => (
                    <tr key={invoice.invoiceId} className="transition-colors hover:bg-primary/5">
                      <td className="px-4 py-3 text-foreground">{formatDate(invoice.createdAt)}</td>
                      <td className="px-4 py-3 text-foreground font-medium">{formatAmount(invoice.amount, invoice.currency)}</td>
                      <td className="px-4 py-3"><InvoiceStatusBadge status={invoice.status} /></td>
                      <td className="px-4 py-3">
                        {invoice.pdfUrl ? (
                          <a
                            href={invoice.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            {t('invoicesDownloadPdf')}
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">N/A</span>
                        )}
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
  )
}
