'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/search-input'
import { EmptyState } from '@/components/ui/empty-state'
import { Truck, FileSearch } from '@ultranos/ui-kit/icons'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface Supplier {
  id: string
  name: string
  contactEmail: string | null
  phone: string | null
  leadTimeDays: number | null
  status: string
  createdAt: string
  updatedAt: string
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === 'ACTIVE' ? 'success' : 'secondary'}>
      {status}
    </Badge>
  )
}

type SupplierStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'
const SUPPLIER_STATUS_FILTERS: SupplierStatusFilter[] = ['ALL', 'ACTIVE', 'INACTIVE']

export default function SuppliersPage() {
  const t = useTranslations('inventory')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [statusFilter, setStatusFilter] = useState<SupplierStatusFilter>('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formLeadTime, setFormLeadTime] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.listSuppliers.query({})
      setSuppliers(result.suppliers as Supplier[])
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('errorLoad'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  function openCreate() {
    setEditingSupplier(null)
    setFormName('')
    setFormEmail('')
    setFormPhone('')
    setFormLeadTime('')
    setShowModal(true)
  }

  function openEdit(supplier: Supplier) {
    setEditingSupplier(supplier)
    setFormName(supplier.name)
    setFormEmail(supplier.contactEmail ?? '')
    setFormPhone(supplier.phone ?? '')
    setFormLeadTime(supplier.leadTimeDays?.toString() ?? '')
    setShowModal(true)
  }

  async function handleSubmit() {
    if (!formName.trim()) return
    try {
      setSubmitting(true)
      setError(null)

      const parsedLeadTime = formLeadTime ? parseInt(formLeadTime, 10) : NaN
      const leadTimeDays = !isNaN(parsedLeadTime) && parsedLeadTime >= 0 ? parsedLeadTime : null

      if (editingSupplier) {
        await trpc.admin.updateSupplier.mutate({
          id: editingSupplier.id,
          name: formName.trim(),
          contactEmail: formEmail.trim() || null,
          phone: formPhone.trim() || null,
          leadTimeDays,
        })
      } else {
        await trpc.admin.createSupplier.mutate({
          name: formName.trim(),
          contactEmail: formEmail.trim() || undefined,
          phone: formPhone.trim() || undefined,
          leadTimeDays: leadTimeDays ?? undefined,
        })
      }

      setShowModal(false)
      fetchSuppliers()
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('supplierError'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleStatus(supplier: Supplier) {
    const newStatus = supplier.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    if (!window.confirm(`${newStatus === 'INACTIVE' ? 'Deactivate' : 'Reactivate'} supplier "${supplier.name}"?`)) return

    try {
      setError(null)
      await trpc.admin.updateSupplier.mutate({ id: supplier.id, status: newStatus })
      fetchSuppliers()
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('supplierError'))
    }
  }

  const statusLabel: Record<SupplierStatusFilter, string> = {
    ALL: t('filterAll'),
    ACTIVE: t('filterActive'),
    INACTIVE: t('filterInactive'),
  }
  const q = search.trim().toLowerCase()
  const visible = suppliers.filter((s) => {
    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false
    if (!q) return true
    return s.name.toLowerCase().includes(q) || (s.contactEmail ?? '').toLowerCase().includes(q)
  })

  return (
    <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-foreground">{t('suppliersPageTitle')}</h1>

        {/* Toolbar: status tabs + search + create — one row, always visible */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
            {SUPPLIER_STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-pressed={statusFilter === s}
              >
                {statusLabel[s]}
              </button>
            ))}
          </div>
          <SearchInput
            dir="auto"
            placeholder={t('suppliersSearchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[200px] flex-1"
            aria-label={t('suppliersSearchPlaceholder')}
          />
          <Button onClick={openCreate}>
            {t('addSupplier')}
          </Button>
        </div>

        {error && (
          <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Content panel — single cohesive box */}
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          {loading ? (
            <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">{t('loadingSuppliers')}</div>
          ) : suppliers.length === 0 ? (
            <div className="flex min-h-[16rem] items-center justify-center">
              <EmptyState
                icon={Truck}
                title={t('noSuppliers')}
                description={t('noSuppliersDescription')}
                action={{ label: t('addSupplier'), onClick: openCreate }}
              />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex min-h-[16rem] items-center justify-center">
              <EmptyState
                icon={FileSearch}
                title={t('noResultsTitle')}
                description={t('noResultsDescription')}
                action={{ label: t('clearFilters'), onClick: () => { setSearch(''); setStatusFilter('ALL') } }}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide text-muted-foreground">{t('colSupplierName')}</th>
                    <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide text-muted-foreground">{t('colEmail')}</th>
                    <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide text-muted-foreground">{t('colPhone')}</th>
                    <th className="px-4 py-3 text-center font-medium text-xs uppercase tracking-wide text-muted-foreground">{t('colLeadTime')}</th>
                    <th className="px-4 py-3 text-center font-medium text-xs uppercase tracking-wide text-muted-foreground">{t('colStatus')}</th>
                    <th className="px-4 py-3 text-center font-medium text-xs uppercase tracking-wide text-muted-foreground">{t('colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.map((supplier) => (
                    <tr key={supplier.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 font-medium">{supplier.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{supplier.contactEmail ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{supplier.phone ?? '—'}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{supplier.leadTimeDays ?? '—'}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={supplier.status} /></td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button variant="outline" size="xs" onClick={() => openEdit(supplier)}>
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => handleToggleStatus(supplier)}
                            className={supplier.status === 'ACTIVE' ? 'hover:bg-destructive/10 hover:text-destructive' : 'hover:bg-success/10 hover:text-success'}
                          >
                            {supplier.status === 'ACTIVE' ? t('deactivate') : t('activate')}
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

        {/* Add/Edit Supplier Modal */}
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingSupplier ? t('editSupplier') : t('addSupplier')}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {editingSupplier ? 'Edit supplier details.' : 'Add a new supplier.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label htmlFor="sup-name" className="block text-sm font-medium text-foreground">
                  {t('supplierName')} <span className="text-destructive">*</span>
                </label>
                <Input
                  id="sup-name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor="sup-email" className="block text-sm font-medium text-foreground">{t('supplierEmail')}</label>
                <Input
                  id="sup-email"
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor="sup-phone" className="block text-sm font-medium text-foreground">{t('supplierPhone')}</label>
                <Input
                  id="sup-phone"
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor="sup-lead" className="block text-sm font-medium text-foreground">{t('supplierLeadTime')}</label>
                <Input
                  id="sup-lead"
                  type="number"
                  min="0"
                  value={formLeadTime}
                  onChange={(e) => setFormLeadTime(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!formName.trim() || submitting}>
                {submitting ? 'Saving...' : editingSupplier ? t('saveChanges') : t('addSupplier')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  )
}
