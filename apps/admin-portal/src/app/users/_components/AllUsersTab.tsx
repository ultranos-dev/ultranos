'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { ExportButton } from '@/components/ExportButton'

type RoleFilter = 'ALL' | 'ADMIN' | 'CLINICIAN' | 'DOCTOR' | 'PHARMACIST' | 'LAB_TECH'
type StatusFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED' | 'PENDING_INVITE'

interface User {
  id: string
  name: string
  email: string
  role: string
  moduleCode: string | null
  moduleName: string | null
  status: string
  mfaEnrolled: boolean
  lastLoginAt: string | null
  createdAt: string
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    ACTIVE: 'bg-success/10 text-success',
    SUSPENDED: 'bg-destructive/10 text-destructive',
    PENDING_INVITE: 'bg-warning/10 text-warning',
  }

  const labelMap: Record<string, string> = {
    ACTIVE: 'Active',
    SUSPENDED: 'Suspended',
    PENDING_INVITE: 'Pending Invite',
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-card text-muted-foreground'}`}>
      {labelMap[status] ?? status}
    </span>
  )
}

function MfaBadge({ enrolled }: { enrolled: boolean }) {
  if (enrolled) {
    return <span className="text-xs font-medium text-success">Enrolled</span>
  }
  return <span className="text-xs font-medium text-warning">&#x26A0; Not Enrolled</span>
}

export function formatRelativeTime(iso: string | null): string {
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

const ROLE_FILTERS: RoleFilter[] = ['ALL', 'ADMIN', 'CLINICIAN', 'DOCTOR', 'PHARMACIST', 'LAB_TECH']
const STATUS_FILTERS: StatusFilter[] = ['ALL', 'ACTIVE', 'SUSPENDED', 'PENDING_INVITE']
const STATUS_LABELS: Record<StatusFilter, string> = {
  ALL: 'All',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  PENDING_INVITE: 'Pending Invite',
}
const PAGE_SIZE = 20

export default function AllUsersTab() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.listUsers.query({
        page,
        pageSize: PAGE_SIZE,
        ...(roleFilter !== 'ALL' && { roleFilter }),
        ...(statusFilter !== 'ALL' && { statusFilter }),
        ...(search.trim() && { search: search.trim() }),
      })
      setUsers(result.users)
      setTotalCount(result.totalCount)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [page, roleFilter, statusFilter, search])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  function handleRoleFilterChange(newFilter: RoleFilter) {
    setRoleFilter(newFilter)
    setPage(1)
  }

  function handleStatusFilterChange(newFilter: StatusFilter) {
    setStatusFilter(newFilter)
    setPage(1)
  }

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1)
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const hasSuspendedUsers = users.some((u) => u.status === 'SUSPENDED')

  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      {/* Top bar: filters + CTA */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Role filter */}
          <select
            value={roleFilter}
            onChange={(e) => handleRoleFilterChange(e.target.value as RoleFilter)}
            className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Filter by role"
          >
            {ROLE_FILTERS.map((r) => (
              <option key={r} value={r}>
                {r === 'ALL' ? 'All Roles' : r.replace('_', ' ')}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value as StatusFilter)}
            className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>

          {/* Search input */}
          <input
            type="text"
            placeholder="Search name or email..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="rounded-full border border-border bg-card px-4 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary w-60"
            aria-label="Search users"
          />
        </div>

        {/* Export + Create User CTA */}
        <div className="flex items-center gap-3">
          <ExportButton exportFn={() => trpc.admin.exportUsers.query()} filters={{}} />
          <Link
            href="/users/create"
            className="rounded-full bg-brand-lime px-5 py-2 text-sm font-semibold text-black hover:bg-brand-lime/90 transition-colors"
          >
            Create User
          </Link>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {/* Suspended users banner */}
      {hasSuspendedUsers && (
        <div className="mt-4 rounded-2xl bg-warning/10 p-3 text-sm text-warning">
          Some users are suspended.{' '}
          <Link href="/subscriptions" className="underline font-medium hover:text-warning/80">
            Review subscriptions
          </Link>
        </div>
      )}

      {loading ? (
        <div className="mt-6 text-muted-foreground">Loading users...</div>
      ) : users.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-border bg-white p-12 text-center">
          <p className="text-lg font-medium text-foreground">No staff users yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Get started by inviting your first team member.
          </p>
          <Link
            href="/users/create"
            className="mt-4 inline-block rounded-full bg-brand-lime px-5 py-2 text-sm font-semibold text-black hover:bg-brand-lime/90 transition-colors"
          >
            Create User
          </Link>
        </div>
      ) : (
        <>
          {/* Users table */}
          <div className="mt-4 overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-black">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Email</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Role</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">MFA</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Last Login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-popover">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => router.push(`/users/${user.id}`)}
                    className="cursor-pointer transition-colors hover:bg-brand-lime/5"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      <Link
                        href={`/users/${user.id}`}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {user.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                    <td className="px-4 py-3 text-foreground">
                      {user.role}
                      {user.moduleName && (
                        <span className="text-muted-foreground"> ({user.moduleName})</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={user.status} /></td>
                    <td className="px-4 py-3"><MfaBadge enrolled={user.mfaEnrolled} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{formatRelativeTime(user.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-card hover:scale-[1.02] transition-transform duration-200"
                >
                  Previous
                </button>
                <span className="flex items-center px-2">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
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
  )
}
