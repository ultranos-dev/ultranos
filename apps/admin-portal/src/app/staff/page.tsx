'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { ExportButton } from '@/components/ExportButton'

type LabRoleFilter = 'ALL' | 'LAB_TECH' | 'SENIOR_TECH' | 'SUPERVISOR' | 'LAB_MANAGER'
type ActivityFilter = 'ALL' | 'ACTIVE_7D' | 'INACTIVE'

interface StaffRow {
  practitionerId: string
  email: string
  labId: string
  labName: string
  labRole: string
  lastActiveAt: string | null
  createdAt: string
  labHasManager: boolean
}

interface LabOption {
  id: string
  labName: string
}

const ROLE_FILTERS: LabRoleFilter[] = ['ALL', 'LAB_TECH', 'SENIOR_TECH', 'SUPERVISOR', 'LAB_MANAGER']
const ROLE_LABELS: Record<LabRoleFilter, string> = {
  ALL: 'All Roles',
  LAB_TECH: 'Lab Tech',
  SENIOR_TECH: 'Senior Tech',
  SUPERVISOR: 'Supervisor',
  LAB_MANAGER: 'Lab Manager',
}

const ROLE_COLORS: Record<string, string> = {
  LAB_TECH: 'bg-blue-100 text-blue-800',
  SENIOR_TECH: 'bg-purple-100 text-purple-800',
  SUPERVISOR: 'bg-amber-100 text-amber-800',
  LAB_MANAGER: 'bg-success-subtle text-success',
}

const PAGE_SIZE = 20

function truncateEmail(email: string): string {
  if (!email) return ''
  const [local, domain] = email.split('@')
  if (!domain) return email
  return `${local.charAt(0)}***@${domain}`
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function RoleBadge({ role }: { role: string }) {
  const label = ROLE_LABELS[role as LabRoleFilter] ?? role
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[role] ?? 'bg-surface text-text-secondary'}`}>
      {label}
    </span>
  )
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
    </svg>
  )
}

export default function StaffPage() {
  const router = useRouter()
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [labs, setLabs] = useState<LabOption[]>([])
  const [roleFilter, setRoleFilter] = useState<LabRoleFilter>('ALL')
  const [labFilter, setLabFilter] = useState('')
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [pageIndex, setPageIndex] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)

  // Fetch labs for dropdown
  useEffect(() => {
    trpc.admin.listLabsForFilter.query().then(setLabs).catch(() => {})
  }, [])

  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.listAllLabStaff.query({
        ...(roleFilter !== 'ALL' && { roleFilter }),
        ...(labFilter && { labFilter }),
        activityFilter,
        cursor: cursors[pageIndex],
        limit: PAGE_SIZE,
      })
      setStaff(result.items)
      setNextCursor(result.nextCursor)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load staff')
    } finally {
      setLoading(false)
    }
  }, [roleFilter, labFilter, activityFilter, cursors, pageIndex])

  useEffect(() => {
    fetchStaff()
  }, [fetchStaff])

  function resetPagination() {
    setCursors([undefined])
    setPageIndex(0)
  }

  function handleNext() {
    if (!nextCursor) return
    const newCursors = [...cursors]
    if (pageIndex + 1 >= newCursors.length) {
      newCursors.push(nextCursor)
    }
    setCursors(newCursors)
    setPageIndex(pageIndex + 1)
  }

  function handlePrevious() {
    if (pageIndex <= 0) return
    setPageIndex(pageIndex - 1)
  }

  const managerlessLabCount = new Set(
    staff.filter((s) => !s.labHasManager).map((s) => s.labId)
  ).size

  return (
    <>
      <TopHeader title="Lab Staff Overview" description="All staff across all labs in the organization." />
      <div className="mx-auto max-w-7xl px-8 py-6">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Role filter — tab-style buttons */}
            <div className="flex rounded-full border border-border overflow-hidden">
              {ROLE_FILTERS.map((r) => (
                <button
                  key={r}
                  onClick={() => { setRoleFilter(r); resetPagination() }}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    roleFilter === r
                      ? 'bg-black text-white'
                      : 'bg-surface text-text-secondary hover:bg-accent-subtle'
                  }`}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>

            {/* Lab filter */}
            <select
              value={labFilter}
              onChange={(e) => { setLabFilter(e.target.value); resetPagination() }}
              className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              aria-label="Filter by lab"
            >
              <option value="">All Labs</option>
              {labs.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.labName}
                </option>
              ))}
            </select>

            {/* Activity filter */}
            <select
              value={activityFilter}
              onChange={(e) => { setActivityFilter(e.target.value as ActivityFilter); resetPagination() }}
              className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              aria-label="Filter by activity"
            >
              <option value="ALL">All Activity</option>
              <option value="ACTIVE_7D">Active (7d)</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          {/* Export */}
          <ExportButton
            exportFn={() =>
              trpc.admin.exportLabStaffCsv.query({
                ...(roleFilter !== 'ALL' && { roleFilter }),
                ...(labFilter && { labFilter }),
                activityFilter,
              })
            }
            filters={{}}
          />
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
        )}

        {/* Managerless lab warning banner (AC #4) */}
        {managerlessLabCount > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-warning-subtle p-3 text-sm text-warning">
            <WarningIcon className="h-4 w-4 shrink-0" />
            Warning: {managerlessLabCount} lab{managerlessLabCount > 1 ? 's' : ''} have no Lab Manager assigned
          </div>
        )}

        {loading ? (
          <div className="mt-6 text-text-secondary">Loading staff...</div>
        ) : staff.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-border bg-white p-12 text-center">
            <p className="text-lg font-medium text-text-primary">No staff found</p>
            <p className="mt-1 text-sm text-text-muted">
              Adjust your filters or add staff to a lab.
            </p>
          </div>
        ) : (
          <>
            {/* Staff table */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-black">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Email</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Lab Name</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Role</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Last Active</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Assigned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface-raised">
                  {staff.map((row) => (
                    <tr
                      key={`${row.practitionerId}-${row.labId}`}
                      onClick={() => router.push(`/labs/${row.labId}/staff`)}
                      className="cursor-pointer transition-colors hover:bg-brand-lime/5"
                    >
                      <td className="px-4 py-3 text-text-muted">{truncateEmail(row.email)}</td>
                      <td className="px-4 py-3 font-medium text-text-primary">
                        <span className="flex items-center gap-1.5">
                          {row.labName}
                          {!row.labHasManager && (
                            <WarningIcon className="h-4 w-4 text-warning shrink-0" />
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3"><RoleBadge role={row.labRole} /></td>
                      <td className="px-4 py-3 text-text-muted">{formatRelativeTime(row.lastActiveAt)}</td>
                      <td className="px-4 py-3 text-text-muted">{formatDate(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
              <span>Page {pageIndex + 1}</span>
              <div className="flex gap-2">
                <button
                  onClick={handlePrevious}
                  disabled={pageIndex === 0}
                  className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
                >
                  Previous
                </button>
                <button
                  onClick={handleNext}
                  disabled={!nextCursor}
                  className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
