'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { ExportButton } from '@/components/ExportButton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { FileText, ClipboardList, FileSearch } from '@ultranos/ui-kit/icons'
import { EmptyState } from '@/components/ui/empty-state'

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

const kycVariantMap: Record<string, 'warning' | 'success' | 'destructive' | 'secondary'> = {
  PENDING_VERIFICATION: 'warning',
  ACTIVE: 'success',
  REJECTED: 'destructive',
  REQUEST_MORE_INFO: 'warning',
  SUSPENDED: 'secondary',
}

const kycLabelMap: Record<string, string> = {
  PENDING_VERIFICATION: 'Pending',
  ACTIVE: 'Active',
  REJECTED: 'Rejected',
  REQUEST_MORE_INFO: 'More Info',
  SUSPENDED: 'Suspended',
}

function KycStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={kycVariantMap[status] ?? 'secondary'}>
      {kycLabelMap[status] ?? status}
    </Badge>
  )
}

function SlaCountdown({ slaBreached, slaRemainingHours }: { slaBreached: boolean; slaRemainingHours: number | null }) {
  if (slaBreached) {
    return <span className="text-sm font-semibold text-destructive">SLA Breached</span>
  }
  if (slaRemainingHours === null) {
    return <span className="text-sm text-muted-foreground">—</span>
  }

  const days = Math.floor(slaRemainingHours / 24)
  const hours = slaRemainingHours % 24
  const isUrgent = slaRemainingHours < 24

  return (
    <span className={`text-sm font-medium ${isUrgent ? 'text-warning' : 'text-muted-foreground'}`}>
      {days > 0 ? `${days}d ${hours}h` : `${hours}h`}
    </span>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'PENDING', 'SLA_BREACHED']
const PAGE_SIZE = 25

export default function KycQueuePage() {
  const t = useTranslations('providers')
  const router = useRouter()

  function getFilterLabel(filter: StatusFilter): string {
    if (filter === 'ALL') return t('filterAll')
    if (filter === 'PENDING') return t('filterPending')
    return t('filterSlaBreached')
  }
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
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('errorLoad'))
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

  const filtersActive = search.trim() !== '' || filter !== 'ALL'

  return (
    <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-foreground">{t('pageTitle')}</h1>

        {/* Toolbar: filter tabs + search + export — one row, always visible */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleFilterChange(s)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  filter === s
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-pressed={filter === s}
              >
                {getFilterLabel(s)}
              </button>
            ))}
          </div>
          <Input
            type="text"
            dir="auto"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="min-w-[200px] flex-1"
            aria-label={t('searchPlaceholder')}
          />
          <ExportButton exportFn={() => trpc.admin.exportKycSubmissions.query()} filters={{}} />
        </div>

        {error && (
          <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Content panel — single cohesive box (matches OPD notifications) */}
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          {loading ? (
            <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">{t('loadingProviders')}</div>
          ) : submissions.length === 0 ? (
            <div className="flex min-h-[16rem] items-center justify-center">
              <EmptyState
                icon={filtersActive ? FileSearch : ClipboardList}
                title={filtersActive ? t('noResultsTitle') : t('noProviders')}
                description={filtersActive ? t('noResultsDescription') : t('noProvidersDescription')}
                action={filtersActive ? { label: t('clearFilters'), onClick: () => { setSearch(''); handleFilterChange('ALL') } } : undefined}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colProviderName')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colSubmittedAt')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colLicenseDoc')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colRegistryStatus')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colDaysPending')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colStatus')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {submissions.map((sub) => (
                    <tr
                      key={sub.submissionId}
                      onClick={() => router.push(`/providers/${sub.submissionId}`)}
                      className={`cursor-pointer transition-colors ${
                        sub.slaBreached
                          ? 'bg-destructive/10 hover:bg-destructive/10'
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/providers/profile/${sub.practitionerId}`}
                          className="font-medium text-start text-foreground hover:text-primary transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {sub.providerName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(sub.submittedAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {sub.licenseDocumentKey ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                            <FileText className="h-4 w-4" />
                            View
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{sub.registryVerificationStatus ?? '—'}</td>
                      <td className="px-4 py-3">
                        <SlaCountdown slaBreached={sub.slaBreached} slaRemainingHours={sub.slaRemainingHours} />
                      </td>
                      <td className="px-4 py-3"><KycStatusBadge status={sub.kycStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination — below the content box */}
        {!loading && submissions.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {cursor + 1}–{Math.min(cursor + PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCursor(Math.max(0, cursor - PAGE_SIZE))}
                disabled={cursor === 0}
              >
                Previous
              </Button>
              <span className="flex items-center px-2">Page {currentPage} of {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCursor(cursor + PAGE_SIZE)}
                disabled={cursor + PAGE_SIZE >= total}
              >
                Next
              </Button>
            </div>
          </div>
        )}
    </div>
  )
}
