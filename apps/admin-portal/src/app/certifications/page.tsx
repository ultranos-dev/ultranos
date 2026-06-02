'use client'

import { useEffect, useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { PathwayCreateModal } from '@/components/certifications/PathwayCreateModal'
import { ExpiryWarningWidget } from '@/components/certifications/ExpiryWarningWidget'

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
  const colorMap: Record<string, string> = {
    ACTIVE: 'bg-success/10 text-success',
    ARCHIVED: 'bg-card text-muted-foreground',
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-card text-muted-foreground'}`}>
      {status}
    </span>
  )
}

function formatDate(iso: string): string {
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
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load certification pathways')
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
    } catch (err: any) {
      setError(err?.message ?? 'Failed to archive pathway')
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(cursor / PAGE_SIZE) + 1

  return (
    <>
      <TopHeader title="Certifications" description="Manage certification pathways and credential records." />
      <div className="mx-auto max-w-7xl px-8 py-6">
        {/* Expiry Warning Widget (AC #6) */}
        <ExpiryWarningWidget />

        {/* Filter tabs + Create button */}
        <div className="flex items-center justify-between mt-6">
          <div className="flex gap-1 rounded-full bg-card p-1 w-fit">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => handleFilterChange(s)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  filter === s
                    ? 'bg-primary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-foreground hover:bg-primary/90 transition-colors"
          >
            Create Pathway
          </button>
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
                          <button
                            onClick={() => handleArchive(pathway.id)}
                            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                          >
                            Archive
                          </button>
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
                  <button
                    onClick={() => setCursor(Math.max(0, cursor - PAGE_SIZE))}
                    disabled={cursor === 0}
                    className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-card hover:scale-[1.02] transition-transform duration-200"
                  >
                    Previous
                  </button>
                  <span className="flex items-center px-2">Page {currentPage} of {totalPages}</span>
                  <button
                    onClick={() => setCursor(cursor + PAGE_SIZE)}
                    disabled={cursor + PAGE_SIZE >= total}
                    className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-card hover:scale-[1.02] transition-transform duration-200"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCreateModal && (
        <PathwayCreateModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false)
            fetchPathways()
          }}
        />
      )}
    </>
  )
}
