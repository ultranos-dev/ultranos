'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { PathwayCreateModal } from '@/components/certifications/PathwayCreateModal'
import { ExpiryWarningWidget } from '@/components/certifications/ExpiryWarningWidget'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SearchInput } from '@/components/ui/search-input'
import { EmptyState } from '@/components/ui/empty-state'
import { Award, FileSearch } from '@ultranos/ui-kit/icons'

type StatusFilter = 'ALL' | 'ACTIVE' | 'ARCHIVED'

interface PathwayEntry {
  id: string
  name: string
  description: string | null
  milestoneCount: number
  status: string
  createdAt: string
  updatedAt: string
}

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, 'success' | 'secondary'> = {
    ACTIVE: 'success',
    ARCHIVED: 'secondary',
  }

  return (
    <Badge variant={variantMap[status] ?? 'secondary'}>
      {status}
    </Badge>
  )
}

function _formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'ACTIVE', 'ARCHIVED']
const PAGE_SIZE = 25

export default function CertificationsPage() {
  const t = useTranslations('certifications')
  const [pathways, setPathways] = useState<PathwayEntry[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [filter, setFilter] = useState<StatusFilter>('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const fetchPathways = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.listCertificationPathways.query({
        status: filter,
        cursor,
        limit: PAGE_SIZE,
      })
      setPathways(result.pathways)
      setTotal(result.total)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('errorLoad'))
    } finally {
      setLoading(false)
    }
  }, [filter, cursor])

  useEffect(() => {
    fetchPathways()
  }, [fetchPathways])

  function handleFilterChange(newFilter: StatusFilter) {
    setFilter(newFilter)
    setCursor(0)
  }

  async function handleArchive(id: string) {
    if (!confirm('Archive this pathway? It will no longer be assignable to staff.')) return
    try {
      await trpc.admin.archiveCertificationPathway.mutate({ id })
      fetchPathways()
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('errorLoad'))
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(cursor / PAGE_SIZE) + 1

  const visible = pathways.filter(
    (p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  const filterLabel: Record<StatusFilter, string> = {
    ALL: t('filterAll'),
    ACTIVE: t('filterActive'),
    ARCHIVED: t('filterArchived'),
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-foreground">{t('pageTitle')}</h1>

        {/* Expiry Warning Widget (AC #6) */}
        <ExpiryWarningWidget />

        {/* Toolbar: status tabs + search + create — one row, always visible */}
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
                {filterLabel[s]}
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
          <Button onClick={() => setShowCreateModal(true)}>
            {t('createPathway')}
          </Button>
        </div>

        {error && (
          <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Content panel — single cohesive box */}
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          {loading ? (
            <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">{t('loadingPathways')}</div>
          ) : pathways.length === 0 ? (
            <div className="flex min-h-[16rem] items-center justify-center">
              <EmptyState
                icon={Award}
                title={t('noPathways')}
                description={t('noPathwaysDescription')}
                action={{ label: t('createPathway'), onClick: () => setShowCreateModal(true) }}
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
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colName')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colDescription')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colMilestones')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colStatus')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.map((pathway) => (
                    <tr key={pathway.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 font-medium">{pathway.name}</td>
                      <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{pathway.description ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{pathway.milestoneCount}</td>
                      <td className="px-4 py-3"><StatusBadge status={pathway.status} /></td>
                      <td className="px-4 py-3">
                        {pathway.status === 'ACTIVE' && (
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleArchive(pathway.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            {t('archive')}
                          </Button>
                        )}
                      </td>
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

      <PathwayCreateModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onCreated={() => {
          setShowCreateModal(false)
          fetchPathways()
        }}
      />
    </>
  )
}
