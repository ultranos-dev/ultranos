'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { db } from '@/lib/db'
import { useCatalogSync } from '@/hooks/useCatalogSync'
import { useDrugCatalogSync } from '@/hooks/useDrugCatalogSync'
import { useInventoryStore } from '@/stores/inventory-store'
import { getTotalStockOnHand } from '@/lib/inventory/fefo'
import { deactivateCatalogItem, reactivateCatalogItem } from '@/lib/inventory/catalog-item-service'
import { searchDrugCatalog } from '@/lib/trpc'
import type { CatalogItem } from '@/lib/inventory/types'
import type { DrugSearchResult } from '@ultranos/shared-types'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Package, FileSearch, Plus } from '@ultranos/ui-kit/icons'
import { CatalogItemFormDialog } from './CatalogItemFormDialog'

interface CatalogRowData {
  item: CatalogItem
  stockOnHand: number
}

export function CatalogBrowsePage() {
  const t = useTranslations('inventory')
  useCatalogSync()
  useDrugCatalogSync()
  const isSyncingCatalog = useInventoryStore((s) => s.isSyncingCatalog)

  const [rows, setRows] = useState<CatalogRowData[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active')
  const [hubResults, setHubResults] = useState<DrugSearchResult[]>([])

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<CatalogItem | undefined>(undefined)

  const reload = useCallback(async () => {
    setLoadError(false)
    try {
      const items = await db.catalogItems.toArray()
      const withStock = await Promise.all(
        items.map(async (item) => ({
          item,
          stockOnHand: await getTotalStockOnHand(item.id),
        }))
      )
      setRows(withStock)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [isSyncingCatalog, reload])

  const filtered = useMemo(() => {
    const base = statusFilter === 'active' ? rows.filter((r) => r.item.isActive) : rows
    if (!search.trim()) return base
    const q = search.toLowerCase()
    return base.filter((r) => {
      const name = r.item.name.toLowerCase()
      const nameLocal = r.item.nameLocal?.toLowerCase() ?? ''
      const barcode = r.item.barcode?.toLowerCase() ?? ''
      const category = r.item.category.toLowerCase()
      return name.includes(q) || nameLocal.includes(q) || barcode.includes(q) || category.includes(q)
    })
  }, [rows, search, statusFilter])

  // Hub drug catalog fallback: query when local search returns nothing
  useEffect(() => {
    const trimmed = search.trim()
    if (filtered.length > 0 || trimmed.length < 2) {
      setHubResults([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const results = await searchDrugCatalog(trimmed)
        setHubResults(results)
      } catch {
        setHubResults([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [search, filtered.length])

  const query = search.trim()
  const filtersActive = query !== ''

  function clearFilters() {
    setSearch('')
  }

  function openCreate() {
    setEditingItem(undefined)
    setDialogOpen(true)
  }

  function openEdit(item: CatalogItem) {
    setEditingItem(item)
    setDialogOpen(true)
  }

  async function handleDeactivate(item: CatalogItem) {
    await deactivateCatalogItem(item.id)
    await reload()
  }

  async function handleReactivate(item: CatalogItem) {
    await reactivateCatalogItem(item.id)
    await reload()
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('catalog')}</h1>

      {/* Toolbar: status filter + search + sync indicator + Add item — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          type="text"
          dir="auto"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchByName')}
          className="min-w-[200px] flex-1"
          inputClassName="h-9 rounded-full"
          aria-label={t('searchByName')}
        />
        <div role="tablist" className="flex h-9 items-stretch gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {(['active', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={statusFilter === f}
              onClick={() => setStatusFilter(f)}
              className={`flex items-center rounded-full px-4 text-sm font-medium transition-colors ${
                statusFilter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(f === 'active' ? 'filterActive' : 'filterAll')}
            </button>
          ))}
        </div>
        {isSyncingCatalog && (
          <span className="text-sm text-muted-foreground">{t('syncing')}</span>
        )}
        <Button onClick={openCreate} size="sm" className="h-9">
          <Plus className="me-1.5 h-4 w-4" />
          {t('addItem')}
        </Button>
      </div>

      {/* Local catalog table */}
      {loading ? (
        <div className="flex min-h-[16rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50 text-sm text-muted-foreground">
          {t('loading')}
        </div>
      ) : loadError ? (
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={Package} title={t('loadError')} />
          </div>
        </div>
      ) : filtered.length > 0 ? (
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('nameCol')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('formCol')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('strengthCol')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('categoryCol')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('stockCol')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('reorderPointCol')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {/* actions */}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => {
                const isLocal = r.item.source === 'local' || r.item.locallyModified
                return (
                  <tr
                    key={r.item.id}
                    className={`transition-colors hover:bg-muted/50 ${!r.item.isActive ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{r.item.name}</span>
                      {isLocal && (
                        <span className="ms-2 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-primary/10 text-primary">
                          {t('localBadge')}
                        </span>
                      )}
                      {r.item.controlledSchedule && (
                        <span className="ms-2 inline-flex items-center rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive">
                          C{r.item.controlledSchedule}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{r.item.form}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.item.strength} {r.item.strengthUnit}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.item.category}</td>
                    <td
                      className={`px-4 py-3 font-medium ${
                        r.stockOnHand <= r.item.reorderPoint
                          ? 'text-warning'
                          : 'text-foreground'
                      }`}
                    >
                      {r.stockOnHand}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.item.reorderPoint}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {r.item.atcCode && (
                          <a
                            href={`pharmopedia://drug/${r.item.atcCode}`}
                            className="text-xs font-medium text-primary-700 underline underline-offset-2"
                            aria-label="Open in Pharmopedia"
                          >
                            Pharmopedia
                          </a>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => openEdit(r.item)}
                        >
                          {t('editItem')}
                        </Button>
                        {r.item.isActive ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => handleDeactivate(r.item)}
                          >
                            {t('deactivate')}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-primary hover:text-primary"
                            onClick={() => handleReactivate(r.item)}
                          >
                            {t('reactivate')}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      ) : search.trim().length >= 2 && hubResults.length > 0 ? null : (
        /* No local results and no Hub fallback — centered boxed empty */
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={filtersActive ? FileSearch : Package}
              title={filtersActive ? t('noResultsTitle') : t('noCatalogItems')}
              description={filtersActive ? t('noResultsDescription') : undefined}
              action={filtersActive ? { label: t('clearFilters'), onClick: clearFilters } : undefined}
            />
          </div>
        </div>
      )}

      {/* Hub drug catalog fallback section */}
      {!loading && !loadError && filtered.length === 0 && search.trim().length >= 2 && hubResults.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {t('globalDrugCatalog')}
          </h2>
          <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('nameCol')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('atcCodeCol')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('doseFormsCol')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">{/* link */}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {hubResults.map((r) => (
                    <tr key={r.atcCode} className="transition-colors hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium text-foreground">{r.innName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.atcCode}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.doseForms.join(', ')}</td>
                      <td className="px-4 py-3">
                        <a
                          href={`pharmopedia://drug/${r.atcCode}`}
                          className="text-xs font-medium text-primary-700 underline underline-offset-2"
                          aria-label="Open in Pharmopedia"
                        >
                          Pharmopedia
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Catalog item form dialog */}
      <CatalogItemFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editingItem}
        onSaved={reload}
      />
    </div>
  )
}
