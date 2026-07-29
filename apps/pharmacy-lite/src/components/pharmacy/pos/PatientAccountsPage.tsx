'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Wallet, FileSearch } from '@ultranos/ui-kit/icons'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { db } from '@/lib/db'
import {
  getAccountsWithBalance,
  getPatientLedger,
  getAgingBuckets,
  type AgingBuckets,
} from '@/lib/pos/patient-account-service'
import { recordCreditPayment } from '@/lib/pos/payment-service'
import type { PatientAccount, LedgerEntry } from '@/lib/pos/types'

const CURRENCY = 'AFN'
const MINOR_UNITS = 2

function fmt(amount: number): string {
  const divisor = Math.pow(10, MINOR_UNITS)
  return `${CURRENCY} ${(amount / divisor).toFixed(MINOR_UNITS)}`
}

function fmtRaw(amount: number): string {
  const divisor = Math.pow(10, MINOR_UNITS)
  return (amount / divisor).toFixed(MINOR_UNITS)
}

function parseMinor(value: string): number {
  const divisor = Math.pow(10, MINOR_UNITS)
  const parsed = parseFloat(value)
  if (isNaN(parsed)) return 0
  return Math.round(parsed * divisor)
}

interface AccountWithName extends PatientAccount {
  patientName: string
}

export function PatientAccountsPage() {
  const t = useTranslations('pos')
  const session = useAuthSessionStore((s) => s.session)
  const [accounts, setAccounts] = useState<AccountWithName[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [aging, setAging] = useState<AgingBuckets | null>(null)
  const [paymentStr, setPaymentStr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const loadAccounts = useCallback(async () => {
    const raw = await getAccountsWithBalance()
    const enriched: AccountWithName[] = await Promise.all(
      raw.map(async (account) => {
        const patient = await db.patients.get(account.patientId)
        return {
          ...account,
          patientName: patient ? patient.nameGiven : t('unknown' as never) ?? 'Unknown',
        }
      })
    )
    setAccounts(enriched)
    setLoading(false)
  }, [t])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  const selectPatient = useCallback(async (patientId: string) => {
    setSelectedPatientId(patientId)
    setError(null)
    setPaymentStr('')
    const [entries, buckets] = await Promise.all([
      getPatientLedger(patientId),
      getAgingBuckets(patientId),
    ])
    setLedger(entries)
    setAging(buckets)
  }, [])

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!selectedPatientId || !session) return

    const amount = parseMinor(paymentStr)
    if (amount <= 0) {
      setError(t('enterValidAmount'))
      return
    }

    setSubmitting(true)
    try {
      await recordCreditPayment({
        patientId: selectedPatientId,
        amount,
        receivedBy: `Practitioner/${session.practitionerId}`,
        hlcTimestamp: new Date().toISOString(),
      })
      setPaymentStr('')
      await selectPatient(selectedPatientId)
      await loadAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('paymentFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  // Patient ledger detail view
  if (selectedPatientId) {
    const account = accounts.find((a) => a.patientId === selectedPatientId)

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" className="w-fit px-0" onClick={() => setSelectedPatientId(null)}>
            {t('backToList')}
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">
            {t('patientAccount', { name: account?.patientName ?? 'Patient' })}
          </h1>
        </div>

        {/* Balance */}
        <div className="rounded-xl bg-card p-5 text-center shadow-card ring-[0.65px] ring-border/50">
          <p className="text-sm text-muted-foreground">{t('outstandingBalance')}</p>
          <p className="text-2xl font-bold tabular-nums text-warning">
            {fmt(account?.balance ?? 0)}
          </p>
        </div>

        {/* Aging buckets */}
        {aging && (
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-md border border-success/20 bg-success/5 p-3 text-center">
              <p className="text-xs text-success">0-30d</p>
              <p className="text-sm font-semibold tabular-nums text-success">{fmtRaw(aging.current)}</p>
            </div>
            <div className="rounded-md border border-warning/20 bg-warning/5 p-3 text-center">
              <p className="text-xs text-warning">31-60d</p>
              <p className="text-sm font-semibold tabular-nums text-warning">{fmtRaw(aging.thirtyDay)}</p>
            </div>
            <div className="rounded-md border border-warning/20 bg-warning/5 p-3 text-center">
              <p className="text-xs text-warning">61-90d</p>
              <p className="text-sm font-semibold tabular-nums text-warning">{fmtRaw(aging.sixtyDay)}</p>
            </div>
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-center">
              <p className="text-xs text-destructive">90+d</p>
              <p className="text-sm font-semibold tabular-nums text-destructive">{fmtRaw(aging.ninetyPlus)}</p>
            </div>
          </div>
        )}

        {/* Payment input */}
        <form onSubmit={handleRecordPayment} className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50 space-y-3">
          <div className="space-y-1">
            <label htmlFor="credit-payment" className="text-sm font-medium text-foreground">
              {t('recordPayment')}
            </label>
            <div className="flex gap-2">
              <input
                id="credit-payment"
                type="number"
                step="any"
                min="0"
                value={paymentStr}
                onChange={(e) => setPaymentStr(e.target.value)}
                className="flex-1 rounded-md border border-border px-3 py-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                placeholder="0.00"
              />
              <Button type="submit" variant="default" disabled={submitting}>
                {submitting ? t('recording') : t('recordPaymentBtn')}
              </Button>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>

        {/* Ledger entries */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">{t('ledger')}</h2>
          <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
            {ledger.length === 0 ? (
              <div className="flex min-h-[16rem] items-center justify-center">
                <EmptyState size="sm" title={t('noEntries')} />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {ledger.map((entry) => {
                  const isCharge = entry.amount > 0
                  return (
                    <li key={entry.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm text-foreground capitalize">{entry.type}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(entry.timestamp).toLocaleDateString()}
                          {entry.note && ` — ${entry.note}`}
                        </p>
                      </div>
                      <p className={`text-sm font-semibold tabular-nums ${isCharge ? 'text-destructive' : 'text-success'}`}>
                        {isCharge ? '+' : ''}{fmtRaw(entry.amount)}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    )
  }

  const query = search.trim().toLowerCase()
  const filtersActive = query !== ''
  const filtered = accounts.filter((account) => {
    if (!query) return true
    return account.patientName.toLowerCase().includes(query)
  })

  function clearFilters() {
    setSearch('')
  }

  // Account list view
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('patientAccounts')}</h1>

      {/* Toolbar: search — always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          type="text"
          dir="auto"
          placeholder={t('searchAccountsPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          aria-label={t('searchAccountsPlaceholder')}
        />
      </div>

      {/* Content panel — single cohesive box */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">
            {t('recording')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={filtersActive ? FileSearch : Wallet}
              title={filtersActive ? t('noResultsTitle') : t('noOutstandingAccounts')}
              description={filtersActive ? t('noResultsDescription') : undefined}
              action={filtersActive ? { label: t('clearFilters'), onClick: clearFilters } : undefined}
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((account) => (
              <li key={account.id}>
                <button
                  type="button"
                  onClick={() => selectPatient(account.patientId)}
                  className="flex w-full items-center justify-between px-4 py-3 text-start transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{account.patientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('lastActivity', { date: new Date(account.lastActivityAt).toLocaleDateString() })}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-warning">
                    {fmt(account.balance)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
