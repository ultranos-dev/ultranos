'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Truck, FileSearch } from '@ultranos/ui-kit/icons'
import { SupplierForm } from './SupplierForm'
import { getAllSuppliers, deactivateSupplier } from '@/lib/procurement/supplier-service'
import type { Supplier } from '@/lib/procurement/types'

type View = 'list' | 'create' | 'edit'
type StatusFilter = 'all' | 'active'

export function SuppliersPage() {
  const t = useTranslations('procurement')
  const [view, setView] = useState<View>('list')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const loadSuppliers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAllSuppliers()
      setSuppliers(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSuppliers()
  }, [loadSuppliers])

  function handleEdit(supplier: Supplier) {
    setEditingSupplier(supplier)
    setView('edit')
  }

  async function handleDeactivate(id: string) {
    await deactivateSupplier(id)
    await loadSuppliers()
  }

  function handleSaved() {
    setView('list')
    setEditingSupplier(null)
    loadSuppliers()
  }

  function handleCancel() {
    setView('list')
    setEditingSupplier(null)
  }

  if (view === 'create') {
    return (
      <div className="flex flex-col gap-4">
        <SupplierForm onSaved={handleSaved} onCancel={handleCancel} />
      </div>
    )
  }

  if (view === 'edit' && editingSupplier) {
    return (
      <div className="flex flex-col gap-4">
        <SupplierForm supplier={editingSupplier} onSaved={handleSaved} onCancel={handleCancel} />
      </div>
    )
  }

  const query = search.trim().toLowerCase()
  const filtersActive = query !== '' || statusFilter !== 'all'
  const filtered = suppliers.filter((s) => {
    if (statusFilter === 'active' && !s.isActive) return false
    if (!query) return true
    return [s.name, s.contactName, s.phone]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query)
  })

  function clearFilters() {
    setSearch('')
    setStatusFilter('all')
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('suppliersTitle')}</h1>

      {/* Toolbar: status tabs + search + Add Supplier — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {(['all', 'active'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={statusFilter === s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'all' ? t('filterAll') : t('filterActive')}
            </button>
          ))}
        </div>
        <SearchInput
          type="text"
          dir="auto"
          placeholder={t('searchSuppliersPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          aria-label={t('searchSuppliersPlaceholder')}
        />
        <Button onClick={() => setView('create')}>{t('addSupplier')}</Button>
      </div>

      {/* Content panel — single cohesive box */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">
            {t('loadingSuppliers')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={filtersActive ? FileSearch : Truck}
              title={filtersActive ? t('noResultsTitle') : t('noSuppliers')}
              description={filtersActive ? t('noResultsDescription') : t('addFirstSupplier')}
              action={
                filtersActive
                  ? { label: t('clearFilters'), onClick: clearFilters }
                  : { label: t('addSupplier'), onClick: () => setView('create') }
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('nameHeader')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('contactHeader')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('phoneHeader')}</th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('actionsHeader')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className={supplier.isActive ? 'transition-colors hover:bg-muted/50' : 'opacity-50'}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{supplier.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{supplier.contactName ?? '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{supplier.phone ?? '-'}</td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" onClick={() => handleEdit(supplier)}>
                          {t('edit')}
                        </Button>
                        {supplier.isActive && (
                          <Button variant="outline" onClick={() => handleDeactivate(supplier.id)}>
                            {t('deactivate')}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
