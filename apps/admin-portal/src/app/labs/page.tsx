'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { ExportButton } from '@/components/ExportButton'

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
  const colorMap: Record<string, string> = {
    PENDING: 'bg-warning-subtle text-warning',
    ACTIVE: 'bg-success-subtle text-success',
    SUSPENDED: 'bg-danger-subtle text-danger',
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-surface text-text-secondary'}`}>
      {status}
    </span>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'PENDING', 'ACTIVE', 'SUSPENDED']
const PAGE_SIZE = 25

export default function LabsPage() {
  const router = useRouter()
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
      const result = await trpc.admin.listLabs.query({
        status: filter,
        cursor,
        limit: PAGE_SIZE,
      })
      setLabs(result.labs)
      setTotal(result.total)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load lab registrations')
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
    <>
      <TopHeader title="Lab Registrations" description="Review and manage lab registration approvals." />
      <div className="mx-auto max-w-7xl px-8 py-6">
        {/* Filter tabs + Export — AC #7 */}
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
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <ExportButton exportFn={() => trpc.admin.exportLabs.query()} filters={{}} />
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
        )}

        {loading ? (
          <div className="mt-6 text-text-secondary">Loading lab registrations...</div>
        ) : labs.length === 0 ? (
          <div className="mt-6 rounded-2xl border-2 border-dashed border-border p-8 text-center">
            <p className="text-text-secondary">No lab registrations found{filter !== 'ALL' ? ` with status ${filter}` : ''}.</p>
          </div>
        ) : (
          <>
            {/* Lab queue table — AC #1, #2 */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary text-xs uppercase tracking-wide">Lab Name</th>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary text-xs uppercase tracking-wide">License Ref</th>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary text-xs uppercase tracking-wide">Accreditation</th>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary text-xs uppercase tracking-wide">Technician</th>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary text-xs uppercase tracking-wide">Registered</th>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary text-xs uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface-raised">
                  {labs.map((lab) => (
                    <tr
                      key={lab.id}
                      onClick={() => router.push(`/labs/${lab.id}`)}
                      className="cursor-pointer hover:bg-accent-subtle transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{lab.labName}</td>
                      <td className="px-4 py-3 text-text-secondary">{lab.licenseReference}</td>
                      <td className="px-4 py-3 text-text-secondary">{lab.accreditationReference ?? '—'}</td>
                      <td className="px-4 py-3 text-text-secondary">{lab.technicianName}</td>
                      <td className="px-4 py-3 text-text-secondary">{formatDate(lab.registeredAt)}</td>
                      <td className="px-4 py-3"><StatusBadge status={lab.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
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
