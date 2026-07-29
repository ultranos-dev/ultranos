'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { ExportButton } from '@/components/ExportButton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SearchInput } from '@/components/ui/search-input'
import { EmptyState } from '@/components/ui/empty-state'
import { FlaskConical, FileSearch } from '@ultranos/ui-kit/icons'

type StatusFilter = 'ALL' | 'PENDING' | 'ACTIVE' | 'SUSPENDED'

interface LabEntry {
  id: string
  labName: string
  licenseReference: string
  accreditationReference: string | null
  technicianName: string
  registeredAt: string
  status: string
}

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, 'warning' | 'success' | 'destructive'> = {
    PENDING: 'warning',
    ACTIVE: 'success',
    SUSPENDED: 'destructive',
  }

  return (
    <Badge variant={variantMap[status] ?? 'secondary'}>
      {status}
    </Badge>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'PENDING', 'ACTIVE', 'SUSPENDED']
const PAGE_SIZE = 25

export default function LabsPage() {
  const t = useTranslations('labs')
  const router = useRouter()
  const [labs, setLabs] = useState<LabEntry[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [filter, setFilter] = useState<StatusFilter>('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLabs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      // TODO: Pass locationId to filter by selected location once backend supports it
      const result = await trpc.admin.listLabs.query({
        status: filter,
        cursor,
        limit: PAGE_SIZE,
      })
      setLabs(result.labs)
      setTotal(result.total)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('errorLoad'))
    } finally {
      setLoading(false)
    }
  }, [filter, cursor])

  useEffect(() => {
    fetchLabs()
  }, [fetchLabs])

  function handleFilterChange(newFilter: StatusFilter) {
    setFilter(newFilter)
    setCursor(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(cursor / PAGE_SIZE) + 1

  const q = search.trim().toLowerCase()
  const visible = labs.filter((lab) => !q || lab.labName.toLowerCase().includes(q))

  return (
    <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-foreground">{t('pageTitle')}</h1>

        {/* Toolbar: filter tabs + search + actions — one row, always visible */}
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
                {s === 'ALL' ? t('filterAll') : s === 'PENDING' ? t('filterPending') : s === 'ACTIVE' ? t('filterActive') : t('filterSuspended')}
              </button>
            ))}
          </div>
          <SearchInput
            dir="auto"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[200px] flex-1"
            aria-label={t('searchPlaceholder')}
          />
          <Button onClick={() => router.push('/labs/create')}>
            {t('createLab')}
          </Button>
          <ExportButton exportFn={() => trpc.admin.exportLabs.query()} filters={{}} />
        </div>

        {error && (
          <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Content panel — single cohesive box */}
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          {loading ? (
            <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">{t('loadingLabs')}</div>
          ) : labs.length === 0 ? (
            <div className="flex min-h-[16rem] items-center justify-center">
              <EmptyState
                icon={FlaskConical}
                title={t('noLabs')}
                description={t('noLabsDescription')}
                action={{ label: t('createLab'), onClick: () => router.push('/labs/create') }}
              />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex min-h-[16rem] items-center justify-center">
              <EmptyState
                icon={FileSearch}
                title={t('noResultsTitle')}
                description={t('noResultsDescription')}
                action={{ label: t('clearSearch'), onClick: () => setSearch('') }}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colLabName')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colLicenseRef')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Accreditation</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Technician</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colCreatedAt')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colStatus')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.map((lab) => (
                    <tr
                      key={lab.id}
                      onClick={() => router.push(`/labs/${lab.id}`)}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{lab.labName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{lab.licenseReference}</td>
                      <td className="px-4 py-3 text-muted-foreground">{lab.accreditationReference ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{lab.technicianName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(lab.registeredAt)}</td>
                      <td className="px-4 py-3"><StatusBadge status={lab.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination — below the content box */}
        {!loading && visible.length > 0 && totalPages > 1 && (
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
