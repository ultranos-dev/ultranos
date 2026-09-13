'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { db } from '@/lib/db'
import {
  getSupplierItemsForCatalogItem,
  upsertSupplierItem,
  setPreferredSupplier,
  removeSupplierItem,
} from '@/lib/procurement/supplier-item-service'
import { getActiveSuppliers } from '@/lib/procurement/supplier-service'
import type { SupplierItem } from '@/lib/procurement/types'
import type { Supplier } from '@/lib/procurement/types'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Package } from '@ultranos/ui-kit/icons'

interface Props {
  catalogItemId: string
  performedBy: string
}

export function SupplierItemsManager({ catalogItemId, performedBy }: Props) {
  const t = useTranslations('inventory')

  const [links, setLinks] = useState<SupplierItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierMap, setSupplierMap] = useState<Record<string, string>>({})
  const [minorUnits, setMinorUnits] = useState(2)
  const [loading, setLoading] = useState(true)

  // Suppliers not yet linked to this catalog item
  const linkedSupplierIds = new Set(links.map((l) => l.supplierId))
  const availableSuppliers = suppliers.filter((s) => !linkedSupplierIds.has(s.id))

  // Add form state
  const [addSupplierId, setAddSupplierId] = useState('')
  const [addPrice, setAddPrice] = useState('')
  const [addMoq, setAddMoq] = useState('')
  const [addLeadTime, setAddLeadTime] = useState('')
  const [addSku, setAddSku] = useState('')
  const [saveError, setSaveError] = useState(false)

  const reload = useCallback(async () => {
    const [rows, activeSuppliers, settings] = await Promise.all([
      getSupplierItemsForCatalogItem(catalogItemId),
      getActiveSuppliers(),
      db.pharmacySettings.toCollection().first(),
    ])
    const mu = settings?.currencyMinorUnits ?? 2
    const map: Record<string, string> = {}
    for (const s of activeSuppliers) map[s.id] = s.name
    setLinks(rows)
    setSuppliers(activeSuppliers)
    setSupplierMap(map)
    setMinorUnits(mu)
    setLoading(false)
  }, [catalogItemId])

  useEffect(() => {
    reload()
  }, [reload])

  function formatPrice(minorValue: number | undefined): string {
    if (minorValue === undefined) return '—'
    return (minorValue / 10 ** minorUnits).toFixed(minorUnits)
  }

  function parsePriceToMinor(v: string): number {
    return Math.round(parseFloat(v || '0') * 10 ** minorUnits)
  }

  async function handleSetPreferred(linkId: string) {
    await setPreferredSupplier(catalogItemId, linkId)
    await reload()
  }

  async function handleRemove(linkId: string) {
    await removeSupplierItem(linkId)
    await reload()
  }

  async function handleAdd() {
    setSaveError(false)
    try {
      await upsertSupplierItem({
        supplierId: addSupplierId,
        catalogItemId,
        unitPrice: addPrice ? parsePriceToMinor(addPrice) : undefined,
        minOrderQty: addMoq ? parseInt(addMoq, 10) : undefined,
        leadTimeDays: addLeadTime ? parseInt(addLeadTime, 10) : undefined,
        supplierSku: addSku || undefined,
        createdBy: performedBy,
      })
      // reset form
      setAddSupplierId('')
      setAddPrice('')
      setAddMoq('')
      setAddLeadTime('')
      setAddSku('')
      await reload()
    } catch {
      setSaveError(true)
    }
  }

  if (loading) return null

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-semibold text-foreground">{t('suppliersForItem')}</h3>

      {/* Existing links */}
      {links.length === 0 ? (
        <div className="overflow-hidden rounded-xl bg-card ring-[0.65px] ring-border/50">
          <div className="flex min-h-[8rem] items-center justify-center">
            <EmptyState
              icon={Package}
              title={t('supplierItemsEmpty')}
              size="sm"
            />
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('supplierItemAddSupplier')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('supplierItemPrice')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('supplierItemMoq')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('supplierItemLeadTime')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('supplierItemSku')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {/* actions */}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {links.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {supplierMap[r.supplierId] ?? r.supplierId}
                      {r.isPreferred && (
                        <span className="ms-2 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold text-success bg-success/10">
                          {t('supplierItemPreferred')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-numeric text-muted-foreground">
                      {formatPrice(r.unitPrice)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.minOrderQty ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.leadTimeDays ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.supplierSku ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {!r.isPreferred && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            data-testid={`si-preferred-${r.id}`}
                            onClick={() => handleSetPreferred(r.id)}
                          >
                            {t('supplierItemSetPreferred')}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          data-testid={`si-remove-${r.id}`}
                          onClick={() => handleRemove(r.id)}
                        >
                          {t('supplierItemRemove')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add form */}
      <div className="rounded-xl bg-card p-4 ring-[0.65px] ring-border/50 flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t('supplierItemAddSupplier')}
            </label>
            <select
              data-testid="si-supplier-select"
              value={addSupplierId}
              onChange={(e) => setAddSupplierId(e.target.value)}
              className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {availableSuppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t('supplierItemPrice')}
            </label>
            <Input
              type="number"
              min="0"
              step="any"
              value={addPrice}
              onChange={(e) => setAddPrice(e.target.value)}
              className="w-28 font-numeric"
              placeholder="0.00"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t('supplierItemMoq')}
            </label>
            <Input
              type="number"
              min="0"
              step="1"
              value={addMoq}
              onChange={(e) => setAddMoq(e.target.value)}
              className="w-24"
              placeholder="0"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t('supplierItemLeadTime')}
            </label>
            <Input
              type="number"
              min="0"
              step="1"
              value={addLeadTime}
              onChange={(e) => setAddLeadTime(e.target.value)}
              className="w-24"
              placeholder="0"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t('supplierItemSku')}
            </label>
            <Input
              type="text"
              value={addSku}
              onChange={(e) => setAddSku(e.target.value)}
              className="w-36"
              placeholder="SKU-123"
            />
          </div>

          <Button
            size="sm"
            data-testid="si-add-btn"
            onClick={handleAdd}
            disabled={!addSupplierId}
          >
            {t('supplierItemAdd')}
          </Button>
        </div>

        {saveError && (
          <p className="text-sm text-destructive">{t('supplierItemSaveError')}</p>
        )}
      </div>
    </div>
  )
}
