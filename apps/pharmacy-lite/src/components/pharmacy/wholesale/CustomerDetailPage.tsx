'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { ChevronLeft, FileSearch, Banknote, Trash2, Plus } from '@ultranos/ui-kit/icons'
import { getCustomerById, updateCustomer } from '@/lib/wholesale/customer-service'
import { getContractPrices, setContractPrice, removeContractPrice } from '@/lib/wholesale/contract-price-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { db } from '@/lib/db'
import type { WholesaleCustomer } from '@/lib/wholesale/types'
import type { ContractPrice, PriceBreak } from '@/lib/wholesale/types'
import type { CatalogItem } from '@/lib/inventory/types'

// ---------------------------------------------------------------------------
// Money helpers (duplicated per-file — same pattern as NewOrderPage/OrderDetailPage)
// ---------------------------------------------------------------------------

function formatAmount(amount: number, currency: string, minorUnits: number): string {
  const divisor = Math.pow(10, minorUnits)
  return `${currency} ${(amount / divisor).toFixed(minorUnits)}`
}

function parseMajorToMinor(displayValue: string, minorUnits: number): number {
  const parsed = parseFloat(displayValue || '0')
  if (isNaN(parsed)) return 0
  return Math.round(parsed * Math.pow(10, minorUnits))
}

// ---------------------------------------------------------------------------
// CustomerDetailPage
// ---------------------------------------------------------------------------

export function CustomerDetailPage() {
  const t = useTranslations('wholesale')
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id as string

  // Customer info
  const [customer, setCustomer] = useState<WholesaleCustomer | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Editable fields
  const [form, setForm] = useState({
    name: '',
    contactName: '',
    phone: '',
    email: '',
    address: '',
    paymentTermsDays: '',
    creditLimit: '',
  })
  const [saving, setSaving] = useState(false)

  // Contract prices
  const [contractPrices, setContractPrices] = useState<ContractPrice[]>([])
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([])
  const [currency, setCurrency] = useState('AFN')
  const [currencyMinorUnits, setCurrencyMinorUnits] = useState(2)

  // Add contract-price row state
  const [catalogSearch, setCatalogSearch] = useState('')
  const [pickedItem, setPickedItem] = useState<CatalogItem | null>(null)
  const [priceInput, setPriceInput] = useState('')
  const [adding, setAdding] = useState(false)

  // Per-row tier add state: keyed by contractPrice.id
  const [tierQtyInputs, setTierQtyInputs] = useState<Record<string, string>>({})
  const [tierPriceInputs, setTierPriceInputs] = useState<Record<string, string>>({})
  const [tierAdding, setTierAdding] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    try {
      const [data, prices, settings, items] = await Promise.all([
        getCustomerById(id),
        getContractPrices(id),
        db.pharmacySettings.toCollection().first(),
        db.catalogItems.toArray(),
      ])
      if (!data) {
        setNotFound(true)
      } else {
        setCustomer(data)
        setForm({
          name: data.name,
          contactName: data.contactName ?? '',
          phone: data.phone ?? '',
          email: data.email ?? '',
          address: data.address ?? '',
          paymentTermsDays: data.paymentTermsDays != null ? String(data.paymentTermsDays) : '',
          creditLimit: data.creditLimit != null ? String(data.creditLimit) : '',
        })
      }
      setContractPrices(prices)
      setCatalogItems(items)
      if (settings) {
        setCurrency(settings.currency)
        setCurrencyMinorUnits(settings.currencyMinorUnits)
      }
    } catch (err) {
      console.error('[CustomerDetailPage] load failed:', err instanceof Error ? err.message : 'unknown')
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async () => {
    if (!customer) return
    setSaving(true)
    try {
      await updateCustomer(id, {
        name: form.name.trim() || customer.name,
        contactName: form.contactName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        paymentTermsDays: form.paymentTermsDays ? Number(form.paymentTermsDays) : undefined,
        creditLimit: form.creditLimit ? Number(form.creditLimit) : undefined,
      })
      await load()
    } catch (err) {
      console.error('[CustomerDetailPage] updateCustomer failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setSaving(false)
    }
  }

  const handleRemovePrice = async (priceId: string) => {
    try {
      await removeContractPrice(priceId)
      await load()
    } catch (err) {
      console.error('[CustomerDetailPage] removeContractPrice failed:', err instanceof Error ? err.message : 'unknown')
    }
  }

  const handleAddTier = async (price: ContractPrice) => {
    const qtyStr = tierQtyInputs[price.id] ?? ''
    const priceStr = tierPriceInputs[price.id] ?? ''
    const qty = parseInt(qtyStr, 10)
    if (!qtyStr || isNaN(qty) || qty < 1 || !priceStr) return
    setTierAdding((prev) => ({ ...prev, [price.id]: true }))
    try {
      const practitionerRef = useAuthSessionStore.getState().getPractitionerRef()
      const newTier: PriceBreak = {
        minQuantity: qty,
        priceMinor: parseMajorToMinor(priceStr, currencyMinorUnits),
      }
      const existingTiers: PriceBreak[] = price.tiers ?? []
      const nextTiers = [...existingTiers, newTier]
      await setContractPrice({
        customerId: id,
        catalogItemId: price.catalogItemId,
        priceMinor: price.priceMinor,
        createdBy: practitionerRef,
        tiers: nextTiers,
      })
      setTierQtyInputs((prev) => ({ ...prev, [price.id]: '' }))
      setTierPriceInputs((prev) => ({ ...prev, [price.id]: '' }))
      await load()
    } catch (err) {
      console.error('[CustomerDetailPage] addTier failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setTierAdding((prev) => ({ ...prev, [price.id]: false }))
    }
  }

  const handleRemoveTier = async (price: ContractPrice, tierIndex: number) => {
    try {
      const practitionerRef = useAuthSessionStore.getState().getPractitionerRef()
      const existingTiers: PriceBreak[] = price.tiers ?? []
      const nextTiers = existingTiers.filter((_, i) => i !== tierIndex)
      await setContractPrice({
        customerId: id,
        catalogItemId: price.catalogItemId,
        priceMinor: price.priceMinor,
        createdBy: practitionerRef,
        tiers: nextTiers,
      })
      await load()
    } catch (err) {
      console.error('[CustomerDetailPage] removeTier failed:', err instanceof Error ? err.message : 'unknown')
    }
  }

  const handleAddPrice = async () => {
    if (!pickedItem || !priceInput) return
    setAdding(true)
    try {
      const practitionerRef = useAuthSessionStore.getState().getPractitionerRef()
      await setContractPrice({
        customerId: id,
        catalogItemId: pickedItem.id,
        priceMinor: parseMajorToMinor(priceInput, currencyMinorUnits),
        createdBy: practitionerRef,
      })
      setPickedItem(null)
      setPriceInput('')
      setCatalogSearch('')
      await load()
    } catch (err) {
      console.error('[CustomerDetailPage] setContractPrice failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setAdding(false)
    }
  }

  // Catalog search filter
  const catalogQuery = catalogSearch.trim().toLowerCase()
  const filteredCatalog = catalogQuery
    ? catalogItems.filter(
        (item) =>
          item.name.toLowerCase().includes(catalogQuery) ||
          item.nameLocal?.toLowerCase().includes(catalogQuery),
      )
    : []

  // Item name lookup helper
  const itemName = (catalogItemId: string) =>
    catalogItems.find((c) => c.id === catalogItemId)?.name ?? catalogItemId

  const backButton = (
    <Button
      data-testid="back-button"
      variant="ghost"
      size="sm"
      className="w-fit px-0"
      onClick={() => router.push('/wholesale/customers')}
    >
      <ChevronLeft size={16} className="me-1" />
      {t('customerDetailBack')}
    </Button>
  )

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={Banknote} title={t('loading')} />
          </div>
        </div>
      </div>
    )
  }

  if (notFound || !customer) {
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={FileSearch}
              title={t('customerNotFound')}
              description={t('customerNotFoundDescription')}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Back button */}
      {backButton}

      {/* Page heading */}
      <h1 className="text-2xl font-semibold text-foreground">{customer.name}</h1>

      {/* Customer info card */}
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <h2 className="text-base font-semibold text-foreground mb-4">{t('customerInfoHeading')}</h2>

        <div className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="detail-name">{t('fieldName')} *</Label>
              <Input
                id="detail-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="detail-contact">{t('fieldContactName')}</Label>
              <Input
                id="detail-contact"
                value={form.contactName}
                onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="detail-phone">{t('fieldPhone')}</Label>
              <Input
                id="detail-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="detail-email">{t('fieldEmail')}</Label>
              <Input
                id="detail-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label htmlFor="detail-address">{t('fieldAddress')}</Label>
              <Input
                id="detail-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="detail-terms">{t('fieldPaymentTerms')}</Label>
              <Input
                id="detail-terms"
                type="number"
                min="0"
                value={form.paymentTermsDays}
                onChange={(e) => setForm((f) => ({ ...f, paymentTermsDays: e.target.value }))}
                placeholder="30"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="detail-credit">{t('fieldCreditLimit')}</Label>
              <Input
                id="detail-credit"
                type="number"
                min="0"
                value={form.creditLimit}
                onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex">
            <Button
              variant="default"
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="w-fit"
            >
              {saving ? t('saving') : t('saveCustomer')}
            </Button>
          </div>
        </div>
      </div>

      {/* Contract prices card */}
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <h2 className="text-base font-semibold text-foreground mb-4">{t('contractPricesHeading')}</h2>

        {/* Prices table or empty state */}
        {contractPrices.length === 0 ? (
          <div className="mb-4">
            <EmptyState
              size="sm"
              icon={Banknote}
              title={t('noContractPrices')}
              description={t('noContractPricesDescription')}
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50 mb-4">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('contractPriceColItem')}
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide tabular-nums">
                    {t('contractPriceColPrice')}
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('columnActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contractPrices.map((price) => (
                  <React.Fragment key={price.id}>
                    <tr className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-foreground">{itemName(price.catalogItemId)}</td>
                      <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">
                        {formatAmount(price.priceMinor, currency, currencyMinorUnits)}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemovePrice(price.id)}
                          aria-label={t('removeContractPrice')}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                    {/* Volume-break tiers sub-section */}
                    <tr className="bg-muted/30">
                      <td colSpan={3} className="px-4 pb-3 pt-2">
                        <p className="text-xs font-medium text-muted-foreground mb-2">{t('volumeBreaks')}</p>
                        {(price.tiers ?? []).length > 0 && (
                          <div className="flex flex-col gap-1 mb-2">
                            {(price.tiers ?? []).map((tier, idx) => (
                              <div key={idx} className="flex items-center gap-3 text-xs">
                                <span className="text-foreground tabular-nums">{tier.minQuantity}</span>
                                <span className="text-muted-foreground">·</span>
                                <span className="text-foreground tabular-nums">
                                  {formatAmount(tier.priceMinor, currency, currencyMinorUnits)}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="ms-auto h-6 px-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => handleRemoveTier(price, idx)}
                                  aria-label={t('removeBreak')}
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Add-tier sub-row */}
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            data-testid={`tier-qty-${price.id}`}
                            type="number"
                            min="1"
                            step="1"
                            placeholder={t('minQuantity')}
                            value={tierQtyInputs[price.id] ?? ''}
                            onChange={(e) =>
                              setTierQtyInputs((prev) => ({ ...prev, [price.id]: e.target.value }))
                            }
                            className="w-24 h-8 text-xs"
                          />
                          <Input
                            data-testid={`tier-price-${price.id}`}
                            type="number"
                            min="0"
                            step="any"
                            placeholder={t('breakPrice')}
                            value={tierPriceInputs[price.id] ?? ''}
                            onChange={(e) =>
                              setTierPriceInputs((prev) => ({ ...prev, [price.id]: e.target.value }))
                            }
                            className="w-28 h-8 text-xs"
                          />
                          <Button
                            data-testid={`tier-add-${price.id}`}
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs text-primary hover:text-primary hover:bg-primary/10"
                            disabled={
                              tierAdding[price.id] ||
                              !tierQtyInputs[price.id] ||
                              !tierPriceInputs[price.id]
                            }
                            onClick={() => handleAddTier(price)}
                          >
                            <Plus size={12} />
                            {t('addVolumeBreak')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add row */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">{t('addContractPrice')}</p>
          <div className="flex flex-wrap items-start gap-3">
            {/* Catalog search */}
            <div className="relative flex-1 min-w-[180px]">
              <Input
                type="search"
                placeholder={t('searchCatalogForPrice')}
                value={pickedItem ? pickedItem.name : catalogSearch}
                onChange={(e) => {
                  setPickedItem(null)
                  setCatalogSearch(e.target.value)
                }}
              />
              {!pickedItem && filteredCatalog.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
                  <ul className="max-h-48 overflow-y-auto py-1">
                    {filteredCatalog.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="w-full px-4 py-2 text-start text-sm hover:bg-muted"
                          onClick={() => {
                            setPickedItem(item)
                            setCatalogSearch('')
                          }}
                        >
                          {item.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Price input */}
            <Input
              type="number"
              min="0"
              step="any"
              placeholder={t('contractPricePlaceholder')}
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              className="w-36"
            />

            {/* Add button */}
            <Button
              variant="default"
              onClick={handleAddPrice}
              disabled={adding || !pickedItem || !priceInput}
            >
              {t('addContractPrice')}
            </Button>

            {/* Clear pick if item is selected */}
            {pickedItem && (
              <Button
                variant="ghost"
                size="sm"
                className="w-fit px-0 text-muted-foreground"
                onClick={() => {
                  setPickedItem(null)
                  setCatalogSearch('')
                  setPriceInput('')
                }}
              >
                {t('clearSearch')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
