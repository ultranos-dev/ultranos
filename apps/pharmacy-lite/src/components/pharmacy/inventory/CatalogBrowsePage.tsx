'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { db } from '@/lib/db'
import { useCatalogSync } from '@/hooks/useCatalogSync'
import { useDrugCatalogSync } from '@/hooks/useDrugCatalogSync'
import { useInventoryStore } from '@/stores/inventory-store'
import { getTotalStockOnHand } from '@/lib/inventory/fefo'
import { searchDrugCatalog } from '@/lib/trpc'
import type { CatalogItem } from '@/lib/inventory/types'
import type { DrugSearchResult } from '@ultranos/shared-types'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Package, FileSearch } from '@ultranos/ui-kit/icons'

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
  const [search, setSearch] = useState('')
  const [hubResults, setHubResults] = useState<DrugSearchResult[]>([])

  useEffect(() => {
    async function load() {
      const items = await db.catalogItems.toArray()
      const withStock = await Promise.all(
        items.map(async (item) => ({
          item,
          stockOnHand: await getTotalStockOnHand(item.id),
        }))
      )
      setRows(withStock)
    }
    load()
  }, [isSyncingCatalog])

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter((r) => {
      const name = r.item.name.toLowerCase()
      const nameLocal = r.item.nameLocal?.toLowerCase() ?? ''
      const barcode = r.item.barcode?.toLowerCase() ?? ''
      const category = r.item.category.toLowerCase()
      return name.includes(q) || nameLocal.includes(q) || barcode.includes(q) || category.includes(q)
    })
  }, [rows, search])

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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('catalog')}</h1>

      {/* Toolbar: search + sync indicator — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          type="text"
          dir="auto"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchByName')}
          className="min-w-[200px] flex-1"
          aria-label={t('searchByName')}
        />
        {isSyncingCatalog && (
          <span className="text-sm text-muted-foreground">{t('syncing')}</span>
        )}
      </div>

      {/* Local catalog table */}
      {filtered.length > 0 ? (
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
              {filtered.map((r) => (
                <tr key={r.item.id} className="transition-colors hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{r.item.name}</span>
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
                    {r.item.atcCode && (
                      <a
                        href={`pharmopedia://drug/${r.item.atcCode}`}
                        className="text-xs font-medium text-primary-700 underline underline-offset-2"
                        aria-label="Open in Pharmopedia"
                      >
                        Pharmopedia
                      </a>
                    )}
                  </td>
                </tr>
              ))}
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
      {filtered.length === 0 && search.trim().length >= 2 && hubResults.length > 0 && (
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
    </div>
  )
}
