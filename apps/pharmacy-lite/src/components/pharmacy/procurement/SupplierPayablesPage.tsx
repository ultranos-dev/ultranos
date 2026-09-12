'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Wallet } from '@ultranos/ui-kit/icons'
import { getSupplierPayables } from '@/lib/procurement/supplier-account-service'
import type { SupplierPayableSummary } from '@/lib/procurement/supplier-account-service'

function formatAmount(amount: number, currency: string, minorUnits: number): string {
  const divisor = Math.pow(10, minorUnits)
  return `${currency} ${(amount / divisor).toFixed(minorUnits)}`
}

function agingChipClass(aging: SupplierPayableSummary['aging']): string {
  if (aging.ninetyPlus > 0) return 'text-destructive'
  if (aging.sixtyDay > 0) return 'text-warning'
  return 'text-muted-foreground'
}

export function SupplierPayablesPage() {
  const t = useTranslations('supplierPayments')
  const router = useRouter()
  const [payables, setPayables] = useState<SupplierPayableSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Currency settings — failure is non-fatal (defaults to 2 minor units)
  const [currency, setCurrency] = useState('AFN')
  const [minorUnits, setMinorUnits] = useState(2)

  useEffect(() => {
    async function loadSettings() {
      try {
        const { db } = await import('@/lib/db')
        const settings = await db.pharmacySettings?.toCollection?.()?.first?.()
        if (settings) {
          if (settings.currency) setCurrency(settings.currency)
          if (typeof settings.currencyMinorUnits === 'number') {
            setMinorUnits(settings.currencyMinorUnits)
          }
        }
      } catch {
        // settings unavailable — keep defaults
      }
    }
    loadSettings()
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const data = await getSupplierPayables()
        setPayables(data)
      } catch (err) {
        console.error('[SupplierPayablesPage] load failed:', err instanceof Error ? err.message : 'unknown')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const fmt = (amount: number) => formatAmount(amount, currency, minorUnits)

  const filtered = search.trim()
    ? payables.filter((p) =>
        p.supplierName.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : payables

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="min-w-[200px] flex-1"
        />
      </div>

      {/* Content box */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={Wallet} title={t('loading')} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={Wallet}
              title={t('noBalances')}
              description={t('noBalancesDescription')}
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colSupplier')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colOutstanding')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colOldestDue')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colInvoiceCount')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colAging')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((p) => (
                <tr
                  key={p.supplierId}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => router.push(`/inventory/payables/${p.supplierId}`)}
                >
                  <td className="px-4 py-3 font-medium text-foreground">{p.supplierName}</td>
                  <td className="px-4 py-3 font-numeric font-semibold text-warning tabular-nums">
                    {fmt(p.outstanding)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.oldestDueDate
                      ? new Date(p.oldestDueDate).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-foreground">{p.invoiceCount}</td>
                  <td className={`px-4 py-3 font-numeric text-xs tabular-nums ${agingChipClass(p.aging)}`}>
                    {t('agingCurrent')}: {fmt(p.aging.current)}
                    {' · '}
                    {t('agingThirty')}: {fmt(p.aging.thirtyDay)}
                    {' · '}
                    {t('agingSixty')}: {fmt(p.aging.sixtyDay)}
                    {' · '}
                    {t('agingNinety')}: {fmt(p.aging.ninetyPlus)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
