'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { recordPayment, type RecordPaymentInput } from '@/lib/payment-service'
import type { PaymentMethod } from '@/lib/db'

const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'CARD', 'INSURANCE', 'WAIVER']

const formatAFN = (value: number) =>
  new Intl.NumberFormat('fa-AF', { style: 'currency', currency: 'AFN' }).format(value)

interface TestItem {
  testCode: string
  testName: string
  price: number
  selected: boolean
}

export function PaymentForm() {
  const t = useTranslations('finance.payment')
  const router = useRouter()
  const session = useAuthSessionStore((s) => s.session)

  const [patientRef, setPatientRef] = useState('')
  const [patientDisplay, setPatientDisplay] = useState('')
  const [tests, setTests] = useState<TestItem[]>([
    { testCode: '58410-2', testName: 'CBC (Complete Blood Count)', price: 250, selected: false },
    { testCode: '57698-3', testName: 'Lipid Panel', price: 400, selected: false },
    { testCode: '4548-4', testName: 'HbA1c', price: 350, selected: false },
  ])
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod | ''>('')
  const [waiverReason, setWaiverReason] = useState('')
  const [insurancePolicyRef, setInsurancePolicyRef] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [successPayment, setSuccessPayment] = useState<{ receiptNumber: string } | null>(null)

  const selectedTests = tests.filter((t) => t.selected)
  const totalDue = selectedTests.reduce((sum, t) => sum + t.price, 0)
  const amountNum = parseFloat(amount) || 0
  const outstandingBalance = Math.max(0, totalDue - amountNum)

  const toggleTest = useCallback((idx: number) => {
    setTests((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, selected: !t.selected } : t)),
    )
  }, [])

  const validate = useCallback((): string[] => {
    const errs: string[] = []
    if (selectedTests.length === 0) errs.push(t('errorNoTests'))
    if (amountNum <= 0) errs.push(t('errorAmountRequired'))
    if (!method) errs.push(t('errorMethodRequired'))
    if (method === 'WAIVER' && !waiverReason.trim()) errs.push(t('errorWaiverReasonRequired'))
    if (method === 'INSURANCE' && !insurancePolicyRef.trim()) errs.push(t('errorInsuranceRefRequired'))
    return errs
  }, [selectedTests, amountNum, method, waiverReason, insurancePolicyRef, t])

  const handleSubmit = useCallback(() => {
    const errs = validate()
    if (errs.length > 0) {
      setErrors(errs)
      return
    }
    setErrors([])
    setShowConfirm(true)
  }, [validate])

  const handleConfirm = useCallback(async () => {
    if (!method) return
    setSubmitting(true)
    try {
      const input: RecordPaymentInput = {
        patientRef: patientRef || 'walk-in',
        testsPayedFor: selectedTests.map((t) => ({
          testCode: t.testCode,
          testName: t.testName,
          price: t.price,
        })),
        amount: amountNum,
        paymentMethod: method,
        cashierId: session?.practitionerId ?? session?.userId ?? 'unknown',
        outstandingBalance,
        waiverReason: method === 'WAIVER' ? waiverReason : undefined,
        insurancePolicyRef: method === 'INSURANCE' ? insurancePolicyRef : undefined,
      }
      const payment = await recordPayment(input)
      setSuccessPayment({ receiptNumber: payment.receiptNumber })
      setShowConfirm(false)
    } catch {
      setErrors(['Failed to record payment. Please try again.'])
      setShowConfirm(false)
    } finally {
      setSubmitting(false)
    }
  }, [method, patientRef, selectedTests, amountNum, session, outstandingBalance, waiverReason, insurancePolicyRef])

  if (successPayment) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
          <p className="text-lg font-semibold text-green-800">{t('success')}</p>
          <p className="mt-2 text-sm text-green-700">
            {successPayment.receiptNumber}
          </p>
          <div className="mt-4 flex gap-3 justify-center">
            <Button
              variant="primary"
              onClick={() => router.push('/finance/receipts')}
            >
              {t('title')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSuccessPayment(null)
                setTests((prev) => prev.map((t) => ({ ...t, selected: false })))
                setAmount('')
                setMethod('')
                setWaiverReason('')
                setInsurancePolicyRef('')
              }}
            >
              {t('submit')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>

      <div className="flex flex-col gap-4">
        {/* Patient Reference */}
        <div className="rounded-lg border border-border bg-card p-4">
          <label className="block text-sm font-semibold text-muted-foreground mb-2">
            {t('patientRef')}
          </label>
          <input
            type="text"
            value={patientDisplay}
            onChange={(e) => {
              setPatientDisplay(e.target.value)
              setPatientRef(e.target.value)
            }}
            placeholder="Ahmad, 45"
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Test Selection */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">{t('testSelection')}</h2>
          <div className="flex flex-col gap-2">
            {tests.map((test, idx) => (
              <label
                key={test.testCode}
                className="flex items-center justify-between rounded-md border border-border p-3 cursor-pointer hover:bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={test.selected}
                    onChange={() => toggleTest(idx)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                  />
                  <span className="text-sm text-foreground">{test.testName}</span>
                </div>
                <span className="text-sm font-medium text-foreground">
                  {formatAFN(test.price)}
                </span>
              </label>
            ))}
          </div>
          {selectedTests.length > 0 && (
            <div className="mt-3 flex justify-between border-t border-border pt-3">
              <span className="text-sm font-semibold text-foreground">{t('totalDue')}</span>
              <span className="text-sm font-bold text-foreground">{formatAFN(totalDue)}</span>
            </div>
          )}
        </div>

        {/* Amount */}
        <div className="rounded-lg border border-border bg-card p-4">
          <label className="block text-sm font-semibold text-muted-foreground mb-2">
            {t('amount')}
          </label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {amountNum > 0 && amountNum < totalDue && (
            <p className="mt-2 text-sm text-amber-600">
              {t('partialPaymentNote')} — {t('outstandingBalance')}: {formatAFN(outstandingBalance)}
            </p>
          )}
        </div>

        {/* Payment Method */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">{t('paymentMethod')}</h2>
          <div className="flex flex-wrap gap-3">
            {PAYMENT_METHODS.map((m) => (
              <label key={m} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="paymentMethod"
                  value={m}
                  checked={method === m}
                  onChange={() => setMethod(m)}
                  className="h-4 w-4 border-border text-primary focus:ring-ring"
                />
                <span className="text-sm text-foreground">
                  {t(m.toLowerCase() as 'cash' | 'card' | 'insurance' | 'waiver')}
                </span>
              </label>
            ))}
          </div>

          {method === 'WAIVER' && (
            <div className="mt-3">
              <label className="block text-sm text-muted-foreground mb-1">{t('waiverReason')}</label>
              <textarea
                value={waiverReason}
                onChange={(e) => setWaiverReason(e.target.value)}
                placeholder={t('waiverReasonPlaceholder')}
                className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                rows={2}
              />
            </div>
          )}

          {method === 'INSURANCE' && (
            <div className="mt-3">
              <label className="block text-sm text-muted-foreground mb-1">{t('insurancePolicyRef')}</label>
              <input
                type="text"
                value={insurancePolicyRef}
                onChange={(e) => setInsurancePolicyRef(e.target.value)}
                placeholder={t('insurancePolicyPlaceholder')}
                className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
        </div>

        {/* Validation Errors */}
        {errors.length > 0 && (
          <div className="rounded-md bg-red-50 p-3">
            {errors.map((err, i) => (
              <p key={i} className="text-sm text-red-700">{err}</p>
            ))}
          </div>
        )}

        {/* Submit */}
        <Button variant="primary" fullWidth onClick={handleSubmit}>
          {t('submit')}
        </Button>

        {/* Confirmation Dialog */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="mx-4 w-full max-w-md rounded-xl bg-card p-6 shadow-lg">
              <h3 className="text-lg font-bold text-foreground mb-2">{t('confirmTitle')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('confirmMessage', { amount: formatAFN(amountNum), method: method })}
              </p>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={submitting}>
                  {t('cancel')}
                </Button>
                <Button variant="primary" onClick={handleConfirm} disabled={submitting}>
                  {submitting ? t('submitting') : t('confirmAction')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
