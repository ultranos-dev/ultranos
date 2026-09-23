'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { SearchInput } from '@/components/ui/search-input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog, DialogContent, DialogFooter, ModalHeader } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Warehouse, FileSearch } from '@ultranos/ui-kit/icons'

const KINDS = ['store', 'room', 'fridge', 'cabinet', 'other'] as const
type LocationKind = (typeof KINDS)[number]

interface FacilityLocation {
  id: string
  facilityId: string
  name: string
  kind: LocationKind
  isPrimary: boolean
  isActive: boolean
}

export function FacilityLocationsManager({ facilityId }: { facilityId: string }) {
  const t = useTranslations('facilityLocations')

  const [locations, setLocations] = useState<FacilityLocation[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Dialog state — editing !== null means edit mode
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<FacilityLocation | null>(null)
  const [formName, setFormName] = useState('')
  const [formKind, setFormKind] = useState<LocationKind>('store')
  const [formIsPrimary, setFormIsPrimary] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchLocations = useCallback(async () => {
    setLoading(true)
    try {
      const result = await trpc.facilityLocations.listForAdmin.query({ facilityId })
      setLocations(result as FacilityLocation[])
    } finally {
      setLoading(false)
    }
  }, [facilityId])

  useEffect(() => {
    fetchLocations()
  }, [fetchLocations])

  function openCreate() {
    setEditing(null)
    setFormName('')
    setFormKind('store')
    setFormIsPrimary(false)
    setSaveError(null)
    setDialogOpen(true)
  }

  function openEdit(loc: FacilityLocation) {
    setEditing(loc)
    setFormName(loc.name)
    setFormKind(loc.kind)
    setFormIsPrimary(loc.isPrimary)
    setSaveError(null)
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditing(null)
    setSaveError(null)
  }

  async function handleSave() {
    if (!formName.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      if (editing !== null) {
        await trpc.facilityLocations.update.mutate({
          id: editing.id,
          name: formName.trim(),
          kind: formKind,
          ...(formIsPrimary ? { isPrimary: true } : {}),
        })
      } else {
        await trpc.facilityLocations.create.mutate({
          facilityId,
          name: formName.trim(),
          kind: formKind,
          isPrimary: formIsPrimary,
        })
      }
      closeDialog()
      fetchLocations()
    } catch (err: unknown) {
      setSaveError((err as Error)?.message ?? t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  async function handleSetPrimary(loc: FacilityLocation) {
    try {
      await trpc.facilityLocations.update.mutate({ id: loc.id, isPrimary: true })
      fetchLocations()
    } catch {
      // silently ignore — user will see no change and can retry
    }
  }

  async function handleToggleActive(loc: FacilityLocation) {
    try {
      await trpc.facilityLocations.setActive.mutate({ id: loc.id, isActive: !loc.isActive })
      fetchLocations()
    } catch {
      // silently ignore
    }
  }

  // Capitalize first letter helper for kind translation key
  function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  const q = search.trim().toLowerCase()
  const visible = q
    ? locations.filter((loc) => loc.name.toLowerCase().includes(q))
    : locations

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>

      {/* Toolbar: search + add — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          dir="auto"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          aria-label={t('searchPlaceholder')}
        />
        <Button onClick={openCreate}>{t('add')}</Button>
      </div>

      {/* Content box */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">
            {t('loading')}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={q ? FileSearch : Warehouse}
              title={t('empty')}
              description={q ? undefined : t('emptyDescription')}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colName')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colKind')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colPrimary')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colStatus')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((loc) => (
                  <tr key={loc.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 font-medium">{loc.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t(`kind${capitalize(loc.kind)}` as Parameters<typeof t>[0])}
                    </td>
                    <td className="px-4 py-3">
                      {loc.isPrimary ? (
                        <Badge variant="success">{t('primary')}</Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetPrimary(loc)}
                        >
                          {t('setPrimary')}
                        </Button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={loc.isActive ? 'success' : 'secondary'}>
                        {loc.isActive ? t('active') : t('inactive')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(loc)}
                        >
                          {t('edit')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleActive(loc)}
                          disabled={loc.isPrimary && loc.isActive}
                          title={loc.isPrimary && loc.isActive ? t('cannotDeactivatePrimary') : undefined}
                        >
                          {loc.isActive ? t('deactivate') : t('reactivate')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent hideClose>
          <ModalHeader title={editing !== null ? t('edit') : t('add')} inset dialog />

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fl-name">{t('fieldName')}</Label>
              <Input
                id="fl-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fl-kind">{t('fieldKind')}</Label>
              <select
                id="fl-kind"
                value={formKind}
                onChange={(e) => setFormKind(e.target.value as LocationKind)}
                className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`kind${capitalize(k)}` as Parameters<typeof t>[0])}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="fl-primary"
                type="checkbox"
                checked={formIsPrimary}
                onChange={(e) => setFormIsPrimary(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="fl-primary">{t('fieldPrimary')}</Label>
            </div>
          </div>

          {saveError && (
            <p role="alert" className="text-sm text-destructive">{saveError}</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim()}>
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
