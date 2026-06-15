import type { PaymentEntry } from './db'

export interface ReceiptData {
  labName: string
  receiptNumber: string
  dateTime: string
  patientDisplay: string // first name + age only (CLAUDE.md Rule #7)
  items: Array<{ name: string; price: number }>
  totalAmount: number
  amountPaid: number
  outstandingBalance: number
  paymentMethod: string
  cashierDisplay: string // truncated ID
  footerText: string
}

/**
 * Generate structured receipt data from a payment entry.
 * @param payment The payment record
 * @param labName Lab name from settings/config
 * @param patientDisplay First name + age only (data minimization)
 * @param footerText Localized "Thank you" text
 */
export function generateReceipt(
  payment: PaymentEntry,
  labName: string,
  patientDisplay: string,
  footerText: string,
): ReceiptData {
  const totalAmount = payment.testsPayedFor.reduce((sum, t) => sum + t.price, 0)

  return {
    labName,
    receiptNumber: payment.receiptNumber,
    dateTime: new Date(payment.createdAt).toLocaleString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    patientDisplay,
    items: payment.testsPayedFor.map((t) => ({ name: t.testName, price: t.price })),
    totalAmount,
    amountPaid: payment.amount,
    outstandingBalance: payment.outstandingBalance,
    paymentMethod: payment.paymentMethod,
    cashierDisplay: payment.cashierId.slice(0, 8),
    footerText,
  }
}

/**
 * Render a receipt as HTML optimized for thermal printer (80mm width).
 * Uses @media print CSS for window.print().
 */
export function renderReceiptForPrint(receipt: ReceiptData): string {
  const itemRows = receipt.items
    .map((item) => {
      const name = item.name.length > 24 ? item.name.slice(0, 24) : item.name
      const price = String(item.price)
      const padding = Math.max(1, 32 - name.length - price.length)
      return `<div>${escapeHtml(name)}${' '.repeat(padding)}${price}</div>`
    })
    .join('\n')

  const balanceLine =
    receipt.outstandingBalance > 0
      ? `<div>Balance:${pad('Balance:', receipt.outstandingBalance)}</div>`
      : ''

  return `<!DOCTYPE html>
<html dir="auto">
<head>
<meta charset="utf-8">
<style>
  @media print {
    @page { size: 80mm auto; margin: 0; }
    body { margin: 0; padding: 4mm; }
  }
  body {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    line-height: 1.4;
    width: 72mm;
    max-width: 72mm;
  }
  .center { text-align: center; }
  .sep { border-top: 1px dashed #000; margin: 4px 0; }
  .bold { font-weight: bold; }
</style>
</head>
<body>
<div class="sep"></div>
<div class="center bold">${escapeHtml(receipt.labName)}</div>
<div class="sep"></div>
<div>Receipt: ${escapeHtml(receipt.receiptNumber)}</div>
<div>Date:    ${escapeHtml(receipt.dateTime)}</div>
<div>&nbsp;</div>
<div>Patient: ${escapeHtml(receipt.patientDisplay)}</div>
<div class="sep"></div>
${itemRows}
<div class="sep"></div>
<div>Total:${pad('Total:', receipt.totalAmount)}</div>
<div>Paid:${pad('Paid:', receipt.amountPaid)}</div>
${balanceLine}
<div>Method: ${escapeHtml(receipt.paymentMethod)}</div>
<div>Cashier: ${escapeHtml(receipt.cashierDisplay)}</div>
<div class="sep"></div>
<div class="center">${escapeHtml(receipt.footerText)}</div>
<div class="sep"></div>
</body>
</html>`
}

/**
 * Render a receipt as plain text for SMS (max 160 characters).
 */
export function renderReceiptForSms(receipt: ReceiptData): string {
  const parts = [
    receipt.receiptNumber,
    `Paid:${receipt.amountPaid}AFN`,
    receipt.outstandingBalance > 0 ? `Bal:${receipt.outstandingBalance}` : '',
    receipt.labName,
  ].filter(Boolean)

  let text = parts.join(' ')
  if (text.length > 160) {
    text = text.slice(0, 157) + '...'
  }
  return text
}

function pad(label: string, value: number): string {
  const valStr = String(value)
  const padding = Math.max(1, 32 - label.length - valStr.length)
  return ' '.repeat(padding) + valStr
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
