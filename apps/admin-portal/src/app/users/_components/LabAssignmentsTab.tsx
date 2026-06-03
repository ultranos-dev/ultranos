'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { ExportButton } from '@/components/ExportButton'
import { TriangleAlert } from '@ultranos/ui-kit/icons'
import AssignStaffModal from '@/components/lab-staff/AssignStaffModal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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

const ROLE_VARIANTS: Record<string, 'default' | 'secondary' | 'warning' | 'success'> = {
  LAB_TECH: 'default',
  SENIOR_TECH: 'secondary',
  SUPERVISOR: 'warning',
  LAB_MANAGER: 'success',
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
  if (diff < 0) return 'Just now'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function RoleBadge({ role }: { role: string }) {
  const label = ROLE_LABELS[role as LabRoleFilter] ?? role
  return (
    <Badge variant={ROLE_VARIANTS[role] ?? 'secondary'}>
      {label}
    </Badge>
  )
}


export default function LabAssignmentsTab() {
  const router = useRouter()
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [labs, setLabs] = useState<LabOption[]>([])
  const [labsError, setLabsError] = useState(false)
  const [managerlessCount, setManagerlessCount] = useState(0)
  const [roleFilter, setRoleFilter] = useState<LabRoleFilter>('ALL')
  const [labFilter, setLabFilter] = useState('')
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [pageIndex, setPageIndex] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)

  // Fetch labs for dropdown and org-wide managerless count on mount
  useEffect(() => {
    trpc.admin.listLabsForFilter.query()
      .then(setLabs)
      .catch(() => setLabsError(true))

    trpc.admin.getManagerlessLabs.query()
      .then((labs) => setManagerlessCount(labs.length))
      .catch(() => {})
  }, [])

  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setNextCursor(null)
      const result = await trpc.admin.listAllLabStaff.query({
        ...(roleFilter !== 'ALL' && { roleFilter }),
        ...(labFilter && { labFilter }),
        activityFilter,
        cursor: cursors[pageIndex],
        limit: PAGE_SIZE,
      })
      setStaff(result.items)
      setNextCursor(result.nextCursor)
    } catch {
      setError('Failed to load staff. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [roleFilter, labFilter, activityFilter, cursors, pageIndex])

  useEffect(() => {
    fetchStaff()
  }, [fetchStaff])

  function resetPagination() {
    setNextCursor(null)
    setCursors([undefined])
    setPageIndex(0)
  }

  function handleNext() {
    if (!nextCursor) return
    setCursors((prev) => {
      const updated = [...prev]
      if (pageIndex + 1 >= updated.length) updated.push(nextCursor)
      return updated
    })
    setPageIndex((prev) => prev + 1)
  }

  function handlePrevious() {
    if (pageIndex <= 0) return
    setPageIndex((prev) => prev - 1)
  }

  return (
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
                    : 'bg-card text-muted-foreground hover:bg-primary/10'
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
            className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Filter by lab"
          >
            <option value="">All Labs</option>
            {labsError && <option disabled>Failed to load labs</option>}
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
            className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Filter by activity"
          >
            <option value="ALL">All Activity</option>
            <option value="ACTIVE_7D">Active (7d)</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => setShowAssignModal(true)}
            aria-label="Assign to Lab"
          >
            Assign to Lab
          </Button>
          <ExportButton
            exportFn={() =>
              trpc.admin.exportLabStaffCsv.mutate({
                ...(roleFilter !== 'ALL' && { roleFilter }),
                ...(labFilter && { labFilter }),
                activityFilter,
              })
            }
            filters={{}}
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {/* Org-wide managerless lab warning banner (AC #4) */}
      {managerlessCount > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-warning/10 p-3 text-sm text-warning">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          Warning: {managerlessCount} lab{managerlessCount > 1 ? 's' : ''} have no Lab Manager assigned
        </div>
      )}

      {loading ? (
        <div className="mt-6 text-muted-foreground">Loading staff...</div>
      ) : staff.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-border bg-white p-12 text-center">
          <p className="text-lg font-medium text-foreground">No staff found</p>
          <p className="mt-1 text-sm text-muted-foreground">
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
                  <th className="ps-4 pe-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Email</th>
                  <th className="ps-4 pe-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Lab Name</th>
                  <th className="ps-4 pe-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Role</th>
                  <th className="ps-4 pe-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Last Active</th>
                  <th className="ps-4 pe-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Assigned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-popover">
                {staff.map((row) => (
                  <tr
                    key={`${row.practitionerId}-${row.labId}`}
                    onClick={() => router.push(`/labs/${row.labId}/staff`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') router.push(`/labs/${row.labId}/staff`) }}
                    tabIndex={0}
                    role="button"
                    className="cursor-pointer transition-colors hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
                  >
                    <td className="ps-4 pe-4 py-3 text-muted-foreground">{truncateEmail(row.email)}</td>
                    <td className="ps-4 pe-4 py-3 font-medium text-foreground">
                      <span className="flex items-center gap-1.5">
                        {row.labName}
                        {!row.labHasManager && (
                          <TriangleAlert className="h-4 w-4 text-warning shrink-0" />
                        )}
                      </span>
                    </td>
                    <td className="ps-4 pe-4 py-3"><RoleBadge role={row.labRole} /></td>
                    <td className="ps-4 pe-4 py-3 text-muted-foreground">{formatRelativeTime(row.lastActiveAt)}</td>
                    <td className="ps-4 pe-4 py-3 text-muted-foreground">{formatDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {pageIndex + 1}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={pageIndex === 0}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                onClick={handleNext}
                disabled={!nextCursor}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {showAssignModal && (
        <AssignStaffModal
          labs={labs}
          onAssigned={async () => {
            setShowAssignModal(false)
            resetPagination()
            await fetchStaff()
            trpc.admin.getManagerlessLabs.query()
              .then((labs) => setManagerlessCount(labs.length))
              .catch(() => {})
          }}
          onClose={() => setShowAssignModal(false)}
        />
      )}
    </div>
  )
}
