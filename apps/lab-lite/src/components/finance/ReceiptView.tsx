'use client'

import { useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { PaymentEntry } from '@/lib/db'
import { generateReceipt, renderReceiptForPrint, renderReceiptForSms } from '@/lib/receipt-generator'
import { reportPaymentEvent } from '@/lib/audit-client'

const formatAFN = (value: number) =>
  new Intl.NumberFormat('fa-AF', { style: 'currency', currency: 'AFN' }).format(value)

interface ReceiptViewProps {
  payment: PaymentEntry
}

export function ReceiptView({ payment }: ReceiptViewProps) {
  const t = useTranslations('finance.receipt')
  const session = useAuthSessionStore((s) => s.session)

  const labName = (session as Record<string, unknown>)?.labName as string ?? 'Lab'

  const receipt = useMemo(
    () =>
      generateReceipt(
        payment,
        labName,
        payment.patientRef,
        t('thankYou'),
      ),
    [payment, labName, t],
  )

  const handlePrint = useCallback(() => {
    const html = renderReceiptForPrint(receipt)
    const printWindow = window.open('', '_blank', 'width=400,height=600')
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.focus()
      printWindow.print()
    }
    void reportPaymentEvent({
      action: 'RECEIPT_GENERATED',
      paymentId: payment.paymentId,
      cashierId: session?.practitionerId ?? session?.userId ?? 'unknown',
    })
  }, [receipt, payment, session])

  const handleCopySms = useCallback(async () => {
    const smsText = renderReceiptForSms(receipt)
    try {
      await navigator.clipboard.writeText(smsText)
    } catch {
      // Fallback — select text for manual copy
    }
  }, [receipt])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('preview')}</h1>

      <div className="rounded-lg border border-border bg-card p-4">
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt className="text-sm text-muted-foreground">{t('receiptNumber')}</dt>
            <dd className="text-sm font-medium text-foreground font-mono">{receipt.receiptNumber}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm text-muted-foreground">{t('date')}</dt>
            <dd className="text-sm text-foreground">{receipt.dateTime}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm text-muted-foreground">{t('patient')}</dt>
            <dd className="text-sm text-foreground">{receipt.patientDisplay}</dd>
          </div>
        </dl>

        <div className="mt-4 border-t border-border pt-3">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t('tests')}</h3>
          {receipt.items.map((item, idx) => (
            <div key={idx} className="flex justify-between text-sm py-1">
              <span className="text-foreground">{item.name}</span>
              <span className="font-medium text-foreground">{formatAFN(item.price)}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 border-t border-border pt-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('total')}</span>
            <span className="font-bold text-foreground">{formatAFN(receipt.totalAmount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('paid')}</span>
            <span className="font-medium text-foreground">{formatAFN(receipt.amountPaid)}</span>
          </div>
          {receipt.outstandingBalance > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('balance')}</span>
              <span className="font-medium text-amber-600">{formatAFN(receipt.outstandingBalance)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('method')}</span>
            <span className="text-foreground">{receipt.paymentMethod}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('cashier')}</span>
            <span className="text-foreground font-mono">{receipt.cashierDisplay}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <Button variant="primary" fullWidth onClick={handlePrint}>
          {t('print')}
        </Button>
        <Button variant="outline" fullWidth onClick={handleCopySms}>
          {t('copySms')}
        </Button>
      </div>
    </div>
  )
}
