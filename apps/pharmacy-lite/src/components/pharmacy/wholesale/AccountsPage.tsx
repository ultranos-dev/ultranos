'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Wallet } from '@ultranos/ui-kit/icons'
import { getAccountsWithBalance, recordPayment } from '@/lib/wholesale/customer-account-service'
import { getAllCustomers } from '@/lib/wholesale/customer-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { CustomerAccount } from '@/lib/wholesale/types'
import type { WholesaleCustomer } from '@/lib/wholesale/types'

interface AccountWithName extends CustomerAccount {
  customerName: string
}

/**
 * Format a minor-unit amount for display.
 * minorUnits defaults to 2 (consistent with DEFAULT_PHARMACY_SETTINGS) so that
 * balances are shown divided by 100 (e.g. 3000 minor → AFN 30.00).
 */
function formatAmount(amount: number, currency: string, minorUnits: number): string {
  const divisor = Math.pow(10, minorUnits)
  return `${currency} ${(amount / divisor).toFixed(minorUnits)}`
}

/**
 * Parse a major-unit string entered by the user into minor units.
 * With minorUnits = 2 (AFN default): typing "20.00" → 2000 minor units.
 */
function parseToMinor(value: string, minorUnits: number): number {
  const parsed = parseFloat(value)
  if (isNaN(parsed) || parsed <= 0) return 0
  return Math.round(parsed * Math.pow(10, minorUnits))
}

export function AccountsPage() {
  const t = useTranslations('wholesale')
  const [accounts, setAccounts] = useState<AccountWithName[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Currency settings — default to 2 minor units (consistent with DEFAULT_PHARMACY_SETTINGS)
  const [currency, setCurrency] = useState('AFN')
  const [minorUnits, setMinorUnits] = useState(2)

  // Payment dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<AccountWithName | null>(null)
  const [paymentStr, setPaymentStr] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const [rawAccounts, customers] = await Promise.all([
        getAccountsWithBalance(),
        getAllCustomers(),
      ])

      const customerMap = new Map<string, WholesaleCustomer>(
        customers.map((c) => [c.id, c])
      )

      const enriched: AccountWithName[] = rawAccounts.map((account) => ({
        ...account,
        customerName: customerMap.get(account.customerId)?.name ?? account.customerId,
      }))

      setAccounts(enriched)
    } catch (err) {
      setError(t('loadError'))
      console.error('[AccountsPage] loadData failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setLoading(false)
    }
  }, [t])

  // Load currency settings separately — failure is non-fatal (defaults to 2 minor units)
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
    loadData()
  }, [loadData])

  function openPaymentDialog(account: AccountWithName) {
    setSelectedAccount(account)
    setPaymentStr('')
    setDialogOpen(true)
  }

  async function handleConfirmPayment() {
    if (!selectedAccount) return
    const amount = parseToMinor(paymentStr, minorUnits)
    if (amount <= 0) return

    setSubmitting(true)
    try {
      const getPractitionerRef = useAuthSessionStore.getState().getPractitionerRef
      await recordPayment({
        customerId: selectedAccount.customerId,
        amount,
        receivedBy: getPractitionerRef(),
      })
      setDialogOpen(false)
      await loadData()
    } catch (err) {
      console.error('[AccountsPage] recordPayment failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setSubmitting(false)
    }
  }

  const fmt = (amount: number) => formatAmount(amount, currency, minorUnits)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('accountsTitle')}</h1>

      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Content box — loading / empty / table */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={Wallet} title={t('accountsLoading')} />
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={Wallet}
              title={t('accountsNoBalances')}
              description={t('accountsNoBalancesDescription')}
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('columnCustomer')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('columnBalance')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('columnLastActivity')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('columnActions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accounts.map((account) => (
                <tr key={account.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium text-foreground">{account.customerName}</td>
                  <td className="px-4 py-3 tabular-nums text-warning font-semibold">
                    {fmt(account.balance)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {account.lastActivityAt
                      ? new Date(account.lastActivityAt).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`record-payment-${account.customerId}`}
                      onClick={() => openPaymentDialog(account)}
                    >
                      {t('recordPayment')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Payment dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('paymentDialogTitle')} — {selectedAccount?.customerName}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-amount-input">{t('paymentAmountLabel')}</Label>
              <Input
                id="payment-amount-input"
                data-testid="payment-amount"
                type="number"
                step="any"
                min="0"
                value={paymentStr}
                onChange={(e) => setPaymentStr(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              {t('cancel')}
            </Button>
            <Button
              variant="default"
              data-testid="confirm-payment"
              onClick={handleConfirmPayment}
              disabled={submitting || parseToMinor(paymentStr, minorUnits) <= 0}
            >
              {submitting ? t('paymentRecording') : t('confirmPayment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
