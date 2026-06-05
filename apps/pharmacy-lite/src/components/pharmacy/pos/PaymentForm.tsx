'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { recordPayment } from '@/lib/pos/payment-service'
import type { Invoice, PaymentMethod } from '@/lib/pos/types'

interface PaymentFormProps {
  invoice: Invoice
  cashDrawerId?: string
  currencyMinorUnits: number
  enableCredit: boolean
  onPaymentRecorded: () => void
}

function formatAmount(amount: number, minorUnits: number): string {
  const divisor = Math.pow(10, minorUnits)
  return (amount / divisor).toFixed(minorUnits)
}

function parseAmount(value: string, minorUnits: number): number {
  const divisor = Math.pow(10, minorUnits)
  const parsed = parseFloat(value)
  if (isNaN(parsed)) return 0
  return Math.round(parsed * divisor)
}

export function PaymentForm({
  invoice,
  cashDrawerId,
  currencyMinorUnits,
  enableCredit,
  onPaymentRecorded,
}: PaymentFormProps) {
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [amountStr, setAmountStr] = useState('')
  const [cardReference, setCardReference] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const session = useAuthSessionStore((s) => s.session)

  // Payment complete state
  if (invoice.amountDue <= 0) {
    return (
      <div className="rounded-lg border border-success/20 bg-success/5 p-6 text-center">
        <p className="text-lg font-semibold text-success">Payment Complete</p>
        <p className="mt-1 text-sm text-success">This invoice has been paid in full.</p>
      </div>
    )
  }

  const methods: { value: PaymentMethod; label: string }[] = [
    { value: 'cash', label: 'Cash' },
    { value: 'card', label: 'Card' },
    ...(enableCredit ? [{ value: 'credit' as PaymentMethod, label: 'Credit' }] : []),
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const amount = parseAmount(amountStr, currencyMinorUnits)
    if (amount <= 0) {
      setError('Enter a valid payment amount.')
      return
    }

    if (!session) {
      setError('No active session.')
      return
    }

    setSubmitting(true)
    try {
      await recordPayment({
        invoiceId: invoice.id,
        method,
        amount,
        reference: method === 'card' ? cardReference || undefined : undefined,
        receivedBy: `Practitioner/${session.practitionerId}`,
        patientId: invoice.patientId,
        hlcTimestamp: new Date().toISOString(),
      })
      setAmountStr('')
      setCardReference('')
      onPaymentRecorded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4 space-y-4">
      {/* Amount due */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Amount Due</p>
        <p className="text-2xl font-bold tabular-nums text-foreground">
          {formatAmount(invoice.amountDue, currencyMinorUnits)}
        </p>
      </div>

      {/* Method selector */}
      <div className="flex gap-2">
        {methods.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMethod(m.value)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
              method === m.value
                ? 'bg-primary-600 text-white'
                : 'bg-muted text-foreground hover:bg-accent'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Credit warning */}
      {method === 'credit' && (
        <p className="rounded-md bg-warning/5 p-2 text-sm text-warning">
          This will add the amount to the patient&apos;s credit account.
        </p>
      )}

      {/* Amount input */}
      <div className="space-y-1">
        <label htmlFor="payment-amount" className="text-sm font-medium text-foreground">
          Amount
        </label>
        <div className="flex items-center gap-2">
          <input
            id="payment-amount"
            type="number"
            step="any"
            min="0"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            placeholder="0.00"
          />
          <button
            type="button"
            onClick={() => setAmountStr(formatAmount(invoice.amountDue, currencyMinorUnits))}
            className="whitespace-nowrap text-sm font-medium text-primary-600 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
          >
            Pay full amount
          </button>
        </div>
      </div>

      {/* Card reference (only for card) */}
      {method === 'card' && (
        <div className="space-y-1">
          <label htmlFor="card-reference" className="text-sm font-medium text-foreground">
            Card Reference
          </label>
          <input
            id="card-reference"
            type="text"
            value={cardReference}
            onChange={(e) => setCardReference(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            placeholder="Last 4 digits or approval code"
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Submit */}
      <Button type="submit" variant="default" className="w-full" disabled={submitting}>
        {submitting ? 'Recording...' : `Record ${method} payment`}
      </Button>
    </form>
  )
}
