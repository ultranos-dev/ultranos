'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { db } from '@/lib/db'
import type { LocalPatient } from '@/lib/db'
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
  const session = useAuthSessionStore((s) => s.session)
  const [accounts, setAccounts] = useState<AccountWithName[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [aging, setAging] = useState<AgingBuckets | null>(null)
  const [paymentStr, setPaymentStr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadAccounts = useCallback(async () => {
    const raw = await getAccountsWithBalance()
    const enriched: AccountWithName[] = await Promise.all(
      raw.map(async (account) => {
        const patient = await db.patients.get(account.patientId)
        return {
          ...account,
          patientName: patient ? patient.nameGiven : 'Unknown',
        }
      })
    )
    setAccounts(enriched)
    setLoading(false)
  }, [])

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
      setError('Enter a valid payment amount.')
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
      setError(err instanceof Error ? err.message : 'Payment failed.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  // Patient ledger detail view
  if (selectedPatientId) {
    const account = accounts.find((a) => a.patientId === selectedPatientId)

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">
            {account?.patientName ?? 'Patient'} — Account
          </h1>
          <Button variant="secondary" onClick={() => setSelectedPatientId(null)}>
            Back to list
          </Button>
        </div>

        {/* Balance */}
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">Outstanding Balance</p>
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
        <form onSubmit={handleRecordPayment} className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="space-y-1">
            <label htmlFor="credit-payment" className="text-sm font-medium text-foreground">
              Record Payment
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
                {submitting ? 'Recording...' : 'Record Payment'}
              </Button>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>

        {/* Ledger entries */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Ledger</h2>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
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
    )
  }

  // Account list view
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Patient Accounts</h1>

      {accounts.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">No outstanding patient accounts.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {accounts.map((account) => (
            <li key={account.id}>
              <button
                type="button"
                onClick={() => selectPatient(account.patientId)}
                className="flex w-full items-center justify-between px-4 py-3 text-start hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{account.patientName}</p>
                  <p className="text-xs text-muted-foreground">
                    Last activity: {new Date(account.lastActivityAt).toLocaleDateString()}
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
  )
}
