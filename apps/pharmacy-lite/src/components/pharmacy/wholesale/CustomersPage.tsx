'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Users, UserPlus, FileSearch } from '@ultranos/ui-kit/icons'
import { getAllCustomers, createCustomer } from '@/lib/wholesale/customer-service'
import type { WholesaleCustomer } from '@/lib/wholesale/types'

export function CustomersPage() {
  const t = useTranslations('wholesale')
  const [customers, setCustomers] = useState<WholesaleCustomer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: '',
    contactName: '',
    phone: '',
    email: '',
    address: '',
    paymentTermsDays: '',
    creditLimit: '',
  })

  const loadCustomers = useCallback(async () => {
    try {
      setError(null)
      const data = await getAllCustomers()
      setCustomers(data)
    } catch (err) {
      setError(t('loadError'))
      console.error('[CustomersPage] loadCustomers failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  const query = search.trim().toLowerCase()
  const filtered = query
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.contactName?.toLowerCase().includes(query) ||
          c.phone?.toLowerCase().includes(query) ||
          c.email?.toLowerCase().includes(query),
      )
    : customers

  async function handleCreate() {
    if (!form.name.trim()) return
    setCreating(true)
    try {
      await createCustomer({
        name: form.name,
        contactName: form.contactName || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        paymentTermsDays: form.paymentTermsDays ? Number(form.paymentTermsDays) : undefined,
        creditLimit: form.creditLimit ? Number(form.creditLimit) : undefined,
      })
      setDialogOpen(false)
      setForm({ name: '', contactName: '', phone: '', email: '', address: '', paymentTermsDays: '', creditLimit: '' })
      await loadCustomers()
    } catch (err) {
      console.error('[CustomersPage] createCustomer failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('customersTitle')}</h1>

      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Toolbar: search + New customer — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          type="search"
          dir="auto"
          placeholder={t('searchCustomers')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          aria-label={t('searchCustomers')}
        />
        <Button variant="default" onClick={() => setDialogOpen(true)} aria-label={t('newCustomer')}>
          <UserPlus size={16} className="me-2" />
          {t('newCustomer')}
        </Button>
      </div>

      {/* Content box — loading / empty / table */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={Users} title={t('loading')} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={query ? FileSearch : Users}
              title={query ? t('noResults') : t('noCustomers')}
              description={query ? t('noResultsDescription') : t('noCustomersDescription')}
              action={
                query
                  ? { label: t('clearSearch'), onClick: () => setSearch('') }
                  : { label: t('newCustomer'), onClick: () => setDialogOpen(true) }
              }
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('columnName')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('columnContact')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('columnPhone')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('columnEmail')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('columnStatus')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((customer) => (
                <tr key={customer.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium text-foreground">{customer.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{customer.contactName ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{customer.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{customer.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        customer.isActive
                          ? 'inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'
                          : 'inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
                      }
                    >
                      {customer.isActive ? t('statusActive') : t('statusInactive')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New Customer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('newCustomerDialogTitle')}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer-name">{t('fieldName')} *</Label>
              <Input
                id="customer-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('fieldNamePlaceholder')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer-contact">{t('fieldContactName')}</Label>
              <Input
                id="customer-contact"
                value={form.contactName}
                onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                placeholder={t('fieldContactNamePlaceholder')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer-phone">{t('fieldPhone')}</Label>
              <Input
                id="customer-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder={t('fieldPhonePlaceholder')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer-email">{t('fieldEmail')}</Label>
              <Input
                id="customer-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder={t('fieldEmailPlaceholder')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer-address">{t('fieldAddress')}</Label>
              <Input
                id="customer-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder={t('fieldAddressPlaceholder')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customer-terms">{t('fieldPaymentTerms')}</Label>
                <Input
                  id="customer-terms"
                  type="number"
                  min="0"
                  value={form.paymentTermsDays}
                  onChange={(e) => setForm((f) => ({ ...f, paymentTermsDays: e.target.value }))}
                  placeholder="30"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customer-credit">{t('fieldCreditLimit')}</Label>
                <Input
                  id="customer-credit"
                  type="number"
                  min="0"
                  value={form.creditLimit}
                  onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={creating}>
              {t('cancel')}
            </Button>
            <Button variant="default" onClick={handleCreate} disabled={creating || !form.name.trim()}>
              {creating ? t('creating') : t('createCustomer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
