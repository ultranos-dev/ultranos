import { describe, it, expect } from 'vitest'
import type { PaymentEntry } from '../lib/db'
import { generateReceipt, renderReceiptForPrint, renderReceiptForSms } from '../lib/receipt-generator'

function makePayment(overrides: Partial<PaymentEntry> = {}): PaymentEntry {
  return {
    id: 1,
    paymentId: 'pay-uuid-001',
    patientRef: 'Ahmad, 45',
    testsPayedFor: [
      { testCode: '58410-2', testName: 'CBC (Complete Blood Count)', price: 250 },
      { testCode: '57698-3', testName: 'Lipid Panel', price: 400 },
    ],
    amount: 650,
    paymentMethod: 'CASH',
    cashierId: 'a1b2c3d4e5f6',
    receiptNumber: 'LAB-RCP-20260530-0001',
    outstandingBalance: 0,
    relatedPaymentIds: [],
    hlcTimestamp: 'mock-hlc',
    createdAt: '2026-05-30T14:30:00.000Z',
    syncStatus: 'pending',
    ...overrides,
  }
}

describe('Receipt Generator', () => {
  describe('generateReceipt', () => {
    it('returns structured receipt data', () => {
      const payment = makePayment()
      const receipt = generateReceipt(payment, 'Test Lab', 'Ahmad, 45', 'Thank you')

      expect(receipt.labName).toBe('Test Lab')
      expect(receipt.receiptNumber).toBe('LAB-RCP-20260530-0001')
      expect(receipt.patientDisplay).toBe('Ahmad, 45')
      expect(receipt.items).toHaveLength(2)
      expect(receipt.totalAmount).toBe(650)
      expect(receipt.amountPaid).toBe(650)
      expect(receipt.outstandingBalance).toBe(0)
      expect(receipt.paymentMethod).toBe('CASH')
      expect(receipt.cashierDisplay).toBe('a1b2c3d4')
      expect(receipt.footerText).toBe('Thank you')
    })

    it('calculates correct total from test prices', () => {
      const payment = makePayment({
        testsPayedFor: [
          { testCode: 'T1', testName: 'Test A', price: 100 },
          { testCode: 'T2', testName: 'Test B', price: 200 },
          { testCode: 'T3', testName: 'Test C', price: 300 },
        ],
      })
      const receipt = generateReceipt(payment, 'Lab', 'Pat', 'Thanks')
      expect(receipt.totalAmount).toBe(600)
    })

    it('shows outstanding balance for partial payments', () => {
      const payment = makePayment({
        amount: 300,
        outstandingBalance: 350,
      })
      const receipt = generateReceipt(payment, 'Lab', 'Pat', 'Thanks')
      expect(receipt.amountPaid).toBe(300)
      expect(receipt.outstandingBalance).toBe(350)
    })
  })

  describe('renderReceiptForPrint', () => {
    it('returns valid HTML', () => {
      const receipt = generateReceipt(makePayment(), 'Test Lab', 'Ahmad, 45', 'Thank you')
      const html = renderReceiptForPrint(receipt)

      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('Test Lab')
      expect(html).toContain('LAB-RCP-20260530-0001')
      expect(html).toContain('Ahmad, 45')
      expect(html).toContain('CBC (Complete Blood Coun')
      expect(html).toContain('Thank you')
    })

    it('includes @media print for 80mm thermal printers', () => {
      const receipt = generateReceipt(makePayment(), 'Lab', 'Pat', 'Thanks')
      const html = renderReceiptForPrint(receipt)
      expect(html).toContain('@media print')
      expect(html).toContain('80mm')
    })

    it('includes balance line for partial payments', () => {
      const payment = makePayment({ amount: 300, outstandingBalance: 350 })
      const receipt = generateReceipt(payment, 'Lab', 'Pat', 'Thanks')
      const html = renderReceiptForPrint(receipt)
      expect(html).toContain('Balance:')
    })

    it('escapes HTML entities', () => {
      const payment = makePayment()
      const receipt = generateReceipt(payment, '<script>alert(1)</script>', 'Pat', 'Thanks')
      const html = renderReceiptForPrint(receipt)
      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;')
    })
  })

  describe('renderReceiptForSms', () => {
    it('returns text within 160 characters', () => {
      const receipt = generateReceipt(makePayment(), 'Test Lab', 'Ahmad, 45', 'Thank you')
      const sms = renderReceiptForSms(receipt)
      expect(sms.length).toBeLessThanOrEqual(160)
    })

    it('includes receipt number and amount', () => {
      const receipt = generateReceipt(makePayment(), 'Test Lab', 'Ahmad, 45', 'Thank you')
      const sms = renderReceiptForSms(receipt)
      expect(sms).toContain('LAB-RCP-20260530-0001')
      expect(sms).toContain('650')
    })

    it('includes balance when outstanding', () => {
      const payment = makePayment({ amount: 300, outstandingBalance: 350 })
      const receipt = generateReceipt(payment, 'Lab', 'Pat', 'Thanks')
      const sms = renderReceiptForSms(receipt)
      expect(sms).toContain('Bal:350')
    })

    it('truncates to 160 chars with ellipsis for long text', () => {
      const longLabName = 'A'.repeat(200)
      const receipt = generateReceipt(makePayment(), longLabName, 'Pat', 'Thanks')
      const sms = renderReceiptForSms(receipt)
      expect(sms.length).toBe(160)
      expect(sms).toMatch(/\.\.\.$/)
    })
  })
})
