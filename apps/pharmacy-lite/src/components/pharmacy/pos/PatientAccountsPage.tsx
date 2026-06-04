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
        <p className="text-sm text-neutral-500">Loading...</p>
      </div>
    )
  }

  // Patient ledger detail view
  if (selectedPatientId) {
    const account = accounts.find((a) => a.patientId === selectedPatientId)

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-neutral-900">
            {account?.patientName ?? 'Patient'} — Account
          </h1>
          <Button variant="secondary" onClick={() => setSelectedPatientId(null)}>
            Back to list
          </Button>
        </div>

        {/* Balance */}
        <div className="rounded-lg border border-neutral-200 bg-white p-4 text-center">
          <p className="text-sm text-neutral-500">Outstanding Balance</p>
          <p className="text-2xl font-bold tabular-nums text-amber-600">
            {fmt(account?.balance ?? 0)}
          </p>
        </div>

        {/* Aging buckets */}
        {aging && (
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-center">
              <p className="text-xs text-green-700">0-30d</p>
              <p className="text-sm font-semibold tabular-nums text-green-800">{fmtRaw(aging.current)}</p>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-center">
              <p className="text-xs text-amber-700">31-60d</p>
              <p className="text-sm font-semibold tabular-nums text-amber-800">{fmtRaw(aging.thirtyDay)}</p>
            </div>
            <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-center">
              <p className="text-xs text-orange-700">61-90d</p>
              <p className="text-sm font-semibold tabular-nums text-orange-800">{fmtRaw(aging.sixtyDay)}</p>
            </div>
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-center">
              <p className="text-xs text-red-700">90+d</p>
              <p className="text-sm font-semibold tabular-nums text-red-800">{fmtRaw(aging.ninetyPlus)}</p>
            </div>
          </div>
        )}

        {/* Payment input */}
        <form onSubmit={handleRecordPayment} className="rounded-lg border border-neutral-200 bg-white p-4 space-y-3">
          <div className="space-y-1">
            <label htmlFor="credit-payment" className="text-sm font-medium text-neutral-700">
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
                className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                placeholder="0.00"
              />
              <Button type="submit" variant="default" disabled={submitting}>
                {submitting ? 'Recording...' : 'Record Payment'}
              </Button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>

        {/* Ledger entries */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-500">Ledger</h2>
          {ledger.length === 0 ? (
            <p className="text-sm text-neutral-400">No entries.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
              {ledger.map((entry) => {
                const isCharge = entry.amount > 0
                return (
                  <li key={entry.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm text-neutral-800 capitalize">{entry.type}</p>
                      <p className="text-xs text-neutral-500">
                        {new Date(entry.timestamp).toLocaleDateString()}
                        {entry.note && ` — ${entry.note}`}
                      </p>
                    </div>
                    <p className={`text-sm font-semibold tabular-nums ${isCharge ? 'text-red-600' : 'text-green-600'}`}>
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
      <h1 className="text-2xl font-bold text-neutral-900">Patient Accounts</h1>

      {accounts.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center">
          <p className="text-neutral-500">No outstanding patient accounts.</p>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
          {accounts.map((account) => (
            <li key={account.id}>
              <button
                type="button"
                onClick={() => selectPatient(account.patientId)}
                className="flex w-full items-center justify-between px-4 py-3 text-start hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
              >
                <div>
                  <p className="text-sm font-medium text-neutral-900">{account.patientName}</p>
                  <p className="text-xs text-neutral-500">
                    Last activity: {new Date(account.lastActivityAt).toLocaleDateString()}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-amber-600">
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
