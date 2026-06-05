'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { useLocationFilter } from '@/hooks/useLocationFilter'
import { ExportButton } from '@/components/ExportButton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'

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
  const router = useRouter()
  const { locationId } = useLocationFilter()
  const [labs, setLabs] = useState<LabEntry[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [filter, setFilter] = useState<StatusFilter>('ALL')
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
      setError((err as Error)?.message ?? 'Failed to load lab registrations')
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

  return (
    <div className="flex flex-col gap-4">
        {/* Filter tabs + Export — AC #7 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => handleFilterChange(s)}
                className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                  filter === s
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => router.push('/labs/create')}>
              Create Lab
            </Button>
            <ExportButton exportFn={() => trpc.admin.exportLabs.query()} filters={{}} />
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {loading ? (
          <div className="mt-6 text-muted-foreground">Loading lab registrations...</div>
        ) : labs.length === 0 ? (
          <EmptyState className="mt-6" title={`No lab registrations found${filter !== 'ALL' ? ` with status ${filter}` : ''}.`} />
        ) : (
          <>
            {/* Lab queue table — AC #1, #2 */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-card">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Lab Name</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">License Ref</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Accreditation</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Technician</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Registered</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-popover">
                  {labs.map((lab) => (
                    <tr
                      key={lab.id}
                      onClick={() => router.push(`/labs/${lab.id}`)}
                      className="cursor-pointer hover:bg-primary/10 transition-colors"
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
  )
}
