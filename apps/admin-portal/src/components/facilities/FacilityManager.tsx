'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { SearchInput } from '@/components/ui/search-input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ExportButton } from '@/components/ExportButton'
import { FileSearch } from '@ultranos/ui-kit/icons'
import type { LucideIcon } from '@ultranos/ui-kit/icons'
import { FacilityFormModal } from './FacilityFormModal'
import { FacilityProfileModal } from './FacilityProfileModal'
import type { FacilityKindConfig } from './config'

type FacilityStatus = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
const FACILITY_STATUS_FILTERS: FacilityStatus[] = ['ALL', 'ACTIVE', 'INACTIVE', 'ARCHIVED']

interface FacilityEntry {
  id: string
  name: string
  facilityType?: string | null
  city?: string | null
  province?: string | null
  isActive: boolean
  archivedAt?: string | null
}

interface FacilityManagerProps {
  kindConfig: FacilityKindConfig
  titleKey: string
  icon: LucideIcon
  showTypeColumn?: boolean
}

export function FacilityManager({
  kindConfig,
  titleKey,
  showTypeColumn,
}: FacilityManagerProps) {
  const t = useTranslations()

  const [facilities, setFacilities] = useState<FacilityEntry[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FacilityStatus>('ALL')
  const [loading, setLoading] = useState(true)

  // Profile modal state
  const [profileId, setProfileId] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)

  // Form modal state
  const [formOpen, setFormOpen] = useState(false)
  const [editInitial, setEditInitial] = useState<(Record<string, unknown> & { id: string }) | undefined>(undefined)

  const fetchFacilities = useCallback(
    async (q?: string, status?: FacilityStatus) => {
      setLoading(true)
      try {
        const result = await kindConfig.listFn({
          cursor: 0,
          limit: 50,
          ...(q ? { q } : {}),
          status: status ?? statusFilter,
        })
        setFacilities(result.facilities)
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kindConfig, statusFilter],
  )

  useEffect(() => {
    fetchFacilities(search.trim() || undefined, statusFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSearch(q: string) {
    setSearch(q)
    fetchFacilities(q.trim() || undefined, statusFilter)
  }

  function handleFilterChange(next: FacilityStatus) {
    setStatusFilter(next)
    fetchFacilities(search.trim() || undefined, next)
  }

  function handleRowClick(id: string) {
    setProfileId(id)
    setProfileOpen(true)
  }

  function handleAdd() {
    setEditInitial(undefined)
    setFormOpen(true)
  }

  function handleEdit(profile: Record<string, unknown> & { id: string }) {
    setEditInitial(profile as Record<string, unknown> & { id: string })
    setFormOpen(true)
  }

  function handleSaved() {
    fetchFacilities(search.trim() || undefined, statusFilter)
  }

  function statusLabel(s: FacilityStatus): string {
    return s === 'ALL'
      ? (t('facilities.filterAll') ?? 'All')
      : s === 'ACTIVE'
        ? (t('facilities.filterActive') ?? 'Active')
        : s === 'INACTIVE'
          ? (t('facilities.filterInactive') ?? 'Inactive')
          : (t('facilities.filterArchived') ?? 'Archived')
  }

  function statusBadge(facility: FacilityEntry) {
    if (facility.archivedAt) {
      return <Badge variant="secondary">{t('common.archived') ?? 'Archived'}</Badge>
    }
    return facility.isActive
      ? <Badge variant="success">{t('common.active') ?? 'Active'}</Badge>
      : <Badge variant="secondary">{t('common.inactive') ?? 'Inactive'}</Badge>
  }

  const q = search.trim().toLowerCase()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t(titleKey)}</h1>

      {/* ONE toolbar row: search → status filter → Create → Export */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          dir="auto"
          placeholder={t('facilities.searchPlaceholder') ?? 'Search…'}
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          inputClassName="rounded-full"
          aria-label={t('facilities.searchPlaceholder') ?? 'Search'}
        />
        <div className="flex w-fit gap-1 rounded-full border border-border bg-card p-1">
          {FACILITY_STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleFilterChange(s)}
              aria-pressed={statusFilter === s}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {statusLabel(s)}
            </button>
          ))}
        </div>
        <Button onClick={handleAdd}>{t('facilities.add') ?? 'Add'}</Button>
        <ExportButton
          exportFn={() => kindConfig.exportFn()}
          filters={{}}
          label={t('facilities.export') ?? 'Export CSV'}
        />
      </div>

      {/* ONE content box */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">
            {t('common.loading') ?? 'Loading…'}
          </div>
        ) : facilities.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={q ? FileSearch : undefined}
              title={t('facilities.empty') ?? 'No facilities found'}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('facilities.name') ?? 'Name'}
                  </th>
                  {showTypeColumn && (
                    <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('facilities.type') ?? 'Type'}
                    </th>
                  )}
                  <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('facilities.location') ?? 'Location'}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('facilities.status') ?? 'Status'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {facilities.map((facility) => (
                  <tr
                    key={facility.id}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => handleRowClick(facility.id)}
                  >
                    <td className="px-4 py-3 font-medium">{facility.name}</td>
                    {showTypeColumn && (
                      <td className="px-4 py-3 capitalize text-muted-foreground">
                        {facility.facilityType ?? '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-muted-foreground">
                      {[facility.city, facility.province].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3">{statusBadge(facility)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Profile modal */}
      {profileId && (
        <FacilityProfileModal
          open={profileOpen}
          onOpenChange={setProfileOpen}
          facilityId={profileId}
          kindConfig={kindConfig}
          onEdit={(profile) => handleEdit(profile as unknown as Record<string, unknown> & { id: string })}
          onChanged={handleSaved}
        />
      )}

      {/* Form modal (create / edit) */}
      <FacilityFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        kindConfig={kindConfig}
        initial={editInitial}
        onSaved={handleSaved}
      />
    </div>
  )
}
