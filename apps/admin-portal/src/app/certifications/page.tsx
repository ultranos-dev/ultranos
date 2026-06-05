'use client'

import { useEffect, useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { PathwayCreateModal } from '@/components/certifications/PathwayCreateModal'
import { ExpiryWarningWidget } from '@/components/certifications/ExpiryWarningWidget'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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
  const [pathways, setPathways] = useState<PathwayEntry[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [filter, setFilter] = useState<StatusFilter>('ALL')
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
      setError((err as Error)?.message ?? 'Failed to load certification pathways')
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
      setError((err as Error)?.message ?? 'Failed to archive pathway')
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(cursor / PAGE_SIZE) + 1

  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
        {/* Expiry Warning Widget (AC #6) */}
        <ExpiryWarningWidget />

        {/* Filter tabs + Create button */}
        <div className="flex items-center justify-between mt-6">
          <div className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => handleFilterChange(s)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  filter === s
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            Create Pathway
          </Button>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {loading ? (
          <div className="mt-6 text-muted-foreground">Loading certification pathways...</div>
        ) : pathways.length === 0 ? (
          <div className="mt-6 rounded-2xl border-2 border-dashed border-border p-8 text-center">
            <p className="text-muted-foreground">No certification pathways found{filter !== 'ALL' ? ` with status ${filter}` : ''}.</p>
          </div>
        ) : (
          <>
            {/* Pathway table (AC #1) */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-card">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Name</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Description</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Milestones</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-popover">
                  {pathways.map((pathway) => (
                    <tr key={pathway.id} className="hover:bg-primary/10 transition-colors">
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
                            Archive
                          </Button>
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
          </>
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
  )
}
