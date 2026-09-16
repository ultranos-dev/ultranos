'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { SearchInput } from '@/components/ui/search-input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { FileSearch } from '@ultranos/ui-kit/icons'
import type { LucideIcon } from '@ultranos/ui-kit/icons'
import { FacilityFormModal } from './FacilityFormModal'
import { FacilityProfileModal } from './FacilityProfileModal'
import type { FacilityKindConfig } from './config'

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
  const [includeArchived, setIncludeArchived] = useState(false)
  const [loading, setLoading] = useState(true)

  // Profile modal state
  const [profileId, setProfileId] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)

  // Form modal state
  const [formOpen, setFormOpen] = useState(false)
  const [editInitial, setEditInitial] = useState<(Record<string, unknown> & { id: string }) | undefined>(undefined)

  const fetchFacilities = useCallback(
    async (q?: string, archived?: boolean) => {
      setLoading(true)
      try {
        const result = await kindConfig.listFn({
          cursor: 0,
          limit: 50,
          ...(q ? { q } : {}),
          includeArchived: archived ?? includeArchived,
        })
        setFacilities(result.facilities)
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kindConfig, includeArchived],
  )

  useEffect(() => {
    fetchFacilities(search.trim() || undefined, includeArchived)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSearch(q: string) {
    setSearch(q)
    fetchFacilities(q.trim() || undefined, includeArchived)
  }

  function handleArchivedToggle(checked: boolean) {
    setIncludeArchived(checked)
    fetchFacilities(search.trim() || undefined, checked)
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
    fetchFacilities(search.trim() || undefined, includeArchived)
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

      {/* ONE toolbar row: search → include-archived → Add */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          dir="auto"
          placeholder={t('facilities.searchPlaceholder') ?? 'Search…'}
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          aria-label={t('facilities.searchPlaceholder') ?? 'Search'}
        />
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => handleArchivedToggle(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          {t('facilities.includeArchived') ?? 'Include archived'}
        </label>
        <Button onClick={handleAdd}>{t('facilities.add') ?? 'Add'}</Button>
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
          onEdit={(profile) => handleEdit(profile as Record<string, unknown> & { id: string })}
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
