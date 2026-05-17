'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'

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
    PENDING: 'bg-amber-100 text-amber-800',
    ACTIVE: 'bg-green-100 text-green-800',
    SUSPENDED: 'bg-red-100 text-red-800',
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-neutral-100 text-neutral-600'}`}>
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
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight">Lab Registrations</h1>
      <p className="mt-1 text-neutral-500">Review and manage lab registration approvals.</p>

      {/* Filter tabs — AC #7 */}
      <div className="mt-6 flex gap-1 rounded-lg bg-neutral-100 p-1 w-fit">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => handleFilterChange(s)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === s
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="mt-6 text-neutral-500">Loading lab registrations...</div>
      ) : labs.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
          <p className="text-neutral-500">No lab registrations found{filter !== 'ALL' ? ` with status ${filter}` : ''}.</p>
        </div>
      ) : (
        <>
          {/* Lab queue table — AC #1, #2 */}
          <div className="mt-4 overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-neutral-600">Lab Name</th>
                  <th className="px-4 py-3 text-start font-medium text-neutral-600">License Ref</th>
                  <th className="px-4 py-3 text-start font-medium text-neutral-600">Accreditation</th>
                  <th className="px-4 py-3 text-start font-medium text-neutral-600">Technician</th>
                  <th className="px-4 py-3 text-start font-medium text-neutral-600">Registered</th>
                  <th className="px-4 py-3 text-start font-medium text-neutral-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {labs.map((lab) => (
                  <tr
                    key={lab.id}
                    onClick={() => router.push(`/labs/${lab.id}`)}
                    className="cursor-pointer hover:bg-neutral-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{lab.labName}</td>
                    <td className="px-4 py-3 text-neutral-600">{lab.licenseReference}</td>
                    <td className="px-4 py-3 text-neutral-600">{lab.accreditationReference ?? '—'}</td>
                    <td className="px-4 py-3 text-neutral-600">{lab.technicianName}</td>
                    <td className="px-4 py-3 text-neutral-600">{formatDate(lab.registeredAt)}</td>
                    <td className="px-4 py-3"><StatusBadge status={lab.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
              <span>
                Showing {cursor + 1}–{Math.min(cursor + PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCursor(Math.max(0, cursor - PAGE_SIZE))}
                  disabled={cursor === 0}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-neutral-50 transition-colors"
                >
                  Previous
                </button>
                <span className="flex items-center px-2">Page {currentPage} of {totalPages}</span>
                <button
                  onClick={() => setCursor(cursor + PAGE_SIZE)}
                  disabled={cursor + PAGE_SIZE >= total}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-neutral-50 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
