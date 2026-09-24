'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { ExportButton } from '@/components/ExportButton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SearchInput } from '@/components/ui/search-input'
import { EmptyState } from '@/components/ui/empty-state'
import { Users, FileSearch, ChevronDown } from '@ultranos/ui-kit/icons'
import { Avatar } from '@ultranos/ui-kit/components/ui/avatar'
import { UserFormModal } from '@/components/users/UserFormModal'
import { UserProfileModal } from '@/components/users/UserProfileModal'

type RoleFilter = 'ALL' | 'ADMIN' | 'CLINICIAN' | 'DOCTOR' | 'PHARMACIST' | 'LAB_TECH'
type StatusFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED' | 'PENDING_INVITE' | 'ARCHIVED'

interface User {
  id: string
  name: string
  email: string
  role: string
  moduleCode?: string | null
  moduleName?: string | null
  status: string
  mfaEnrolled?: boolean
  phone?: string | null
  jobTitle?: string | null
  department?: string | null
  photoUrl?: string | null
  lastLoginAt: string | null
  createdAt: string
}

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'secondary'> = {
  ACTIVE: 'success',
  SUSPENDED: 'destructive',
  PENDING_INVITE: 'warning',
  ARCHIVED: 'secondary',
}
/** i18n key suffix for each user status (users.status*). */
const STATUS_KEY: Record<string, string> = {
  ACTIVE: 'statusActive',
  SUSPENDED: 'statusSuspended',
  PENDING_INVITE: 'statusPendingInvite',
  ARCHIVED: 'statusArchived',
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('users')
  const key = STATUS_KEY[status]
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>
      {key ? t(key) : status}
    </Badge>
  )
}

function MfaBadge({ enrolled }: { enrolled: boolean }) {
  const t = useTranslations('users')
  if (enrolled) {
    return <Badge variant="success">{t('mfaEnrolled')}</Badge>
  }
  return <Badge variant="warning">{t('mfaNotEnrolled')}</Badge>
}

/**
 * Relative "time ago". When a next-intl translator is provided the strings are
 * localized; without one (e.g. unit tests) it falls back to English so the
 * pure-function contract stays testable.
 */
export function formatRelativeTime(
  iso: string | null,
  t?: (k: string, v?: Record<string, string | number | Date>) => string,
): string {
  if (!iso) return t ? t('relativeNever') : 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return t ? t('relativeJustNow') : 'Just now'
  if (minutes < 60) return t ? t('relativeMinutesAgo', { minutes }) : `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t ? t('relativeHoursAgo', { hours }) : `${hours}h ago`
  const days = Math.floor(hours / 24)
  return t ? t('relativeDaysAgo', { days }) : `${days}d ago`
}

const ROLE_FILTERS: RoleFilter[] = ['ALL', 'ADMIN', 'CLINICIAN', 'DOCTOR', 'PHARMACIST', 'LAB_TECH']
const STATUS_FILTERS: StatusFilter[] = ['ALL', 'ACTIVE', 'SUSPENDED', 'PENDING_INVITE', 'ARCHIVED']
/** i18n key suffix for the status filter dropdown (users.statusFilter*). */
const STATUS_FILTER_KEY: Record<StatusFilter, string> = {
  ALL: 'statusFilterAll',
  ACTIVE: 'statusActive',
  SUSPENDED: 'statusSuspended',
  PENDING_INVITE: 'statusPendingInvite',
  ARCHIVED: 'statusArchived',
}
const PAGE_SIZE = 20

export default function AllUsersTab() {
  const t = useTranslations('users')
  const tc = useTranslations('common')
  const tp = useTranslations('pagination')
  const [users, setUsers] = useState<User[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [formOpen, setFormOpen] = useState(false)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.listUsers.query({
        cursor: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        ...(roleFilter !== 'ALL' && { role: roleFilter }),
        ...(statusFilter !== 'ALL' && { status: statusFilter as 'ACTIVE' | 'SUSPENDED' | 'PENDING_INVITE' | 'ARCHIVED' }),
        ...(search.trim() && { search: search.trim() }),
      })
      setUsers(result.users)
      setTotalCount(result.total)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('loadUsersError'))
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

  function clearFilters() {
    setRoleFilter('ALL')
    setStatusFilter('ALL')
    setSearch('')
    setPage(1)
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const hasSuspendedUsers = users.some((u) => u.status === 'SUSPENDED')
  const filtersActive = roleFilter !== 'ALL' || statusFilter !== 'ALL' || search.trim() !== ''

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: search → status filter → role filter → Add → Export — one row, always rendered */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search input */}
        <SearchInput
          dir="auto"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="min-w-[200px] flex-1"
          inputClassName="h-9 rounded-full"
          aria-label={t('searchPlaceholder')}
        />

        {/* Status filter — pill tab-bar */}
        <div className="flex h-9 items-stretch gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleStatusFilterChange(s)}
              className={`flex items-center rounded-full px-4 text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={statusFilter === s}
            >
              {t(STATUS_FILTER_KEY[s])}
            </button>
          ))}
        </div>

        {/* Role filter — secondary select */}
        <div className="relative">
          <select
            value={roleFilter}
            onChange={(e) => handleRoleFilterChange(e.target.value as RoleFilter)}
            className="h-9 w-full appearance-none rounded-full border border-border bg-background text-foreground ps-3 pe-9 text-sm"
            aria-label={t('filterByRole')}
          >
            {ROLE_FILTERS.map((r) => (
              <option key={r} value={r}>
                {r === 'ALL' ? t('filterAllRoles') : r.replace('_', ' ')}
              </option>
            ))}
          </select>
          <ChevronDown size={16} aria-hidden className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>

        {/* Add + Export */}
        <Button className="h-9" onClick={() => setFormOpen(true)}>{t('add')}</Button>
        <ExportButton exportFn={() => trpc.admin.exportUsers.query()} filters={{}} />
      </div>

      {error && (
        <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {/* Suspended users banner */}
      {hasSuspendedUsers && (
        <div className="rounded-2xl bg-warning/10 p-3 text-sm text-warning">
          {t('suspendedBanner')}{' '}
          <Link href="/subscriptions" className="underline font-medium hover:text-warning/80">
            {t('reviewSubscriptions')}
          </Link>
        </div>
      )}

      {/* Content panel — single cohesive box */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">{t('loadingUsers')}</div>
        ) : users.length === 0 && !filtersActive ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={Users}
              title={t('noUsers')}
              description={t('noUsersDescription')}
              action={{ label: t('add'), onClick: () => setFormOpen(true) }}
            />
          </div>
        ) : users.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={FileSearch}
              title={t('noResultsTitle')}
              description={t('noResultsDescription')}
              action={{ label: t('clearFilters'), onClick: clearFilters }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{tc('name')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{tc('email')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{tc('role')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colDepartment')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colPhone')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{tc('status')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colMfa')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colLastLogin')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => { setProfileUserId(user.id); setProfileOpen(true) }}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      <div className="flex items-center gap-2.5">
                        <Avatar src={user.photoUrl} name={user.name} size={28} />
                        {user.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                    <td className="px-4 py-3 text-foreground">
                      {user.role}
                      {user.moduleName && (
                        <span className="text-muted-foreground"> ({user.moduleName})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{user.department ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{user.phone ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={user.status} /></td>
                    <td className="px-4 py-3"><MfaBadge enrolled={user.mfaEnrolled ?? false} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{formatRelativeTime(user.lastLoginAt, t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination — below the content box */}
      {!loading && users.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {tp('showing', { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, totalCount), total: totalCount })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              {tp('previous')}
            </Button>
            <span className="flex items-center px-2">{tp('pageOf', { page, totalPages })}</span>
            <Button
              variant="outline"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
            >
              {tp('next')}
            </Button>
          </div>
        </div>
      )}

      {/* Create user modal */}
      <UserFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreated={fetchUsers}
      />

      {/* User profile modal */}
      {profileUserId && (
        <UserProfileModal
          open={profileOpen}
          onOpenChange={setProfileOpen}
          userId={profileUserId}
          onChanged={fetchUsers}
        />
      )}
    </div>
  )
}
