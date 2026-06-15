import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

// Mock audit-client before importing payment-service
vi.mock('../lib/audit-client', () => ({
  reportPaymentEvent: vi.fn(),
}))

// Mock hlc
vi.mock('../lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test-node' }) },
  serializeHlc: () => 'mock-hlc-timestamp',
}))

import { getDb } from '../lib/db'
import { recordPayment, getPaymentsForPatient, getOutstandingBalance, getPaymentsByDate } from '../lib/payment-service'
import { reportPaymentEvent } from '../lib/audit-client'

describe('Payment Service', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.payments.clear()
    await db.syncQueue.clear()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    const db = getDb()
    await db.payments.clear()
    await db.syncQueue.clear()
  })

  describe('recordPayment', () => {
    it('creates a payment entry in Dexie', async () => {
      const result = await recordPayment({
        patientRef: 'pat-123',
        testsPayedFor: [
          { testCode: '58410-2', testName: 'CBC', price: 250 },
        ],
        amount: 250,
        paymentMethod: 'CASH',
        cashierId: 'tech-001',
        outstandingBalance: 0,
      })

      expect(result.id).toBeDefined()
      expect(result.paymentId).toBeDefined()
      expect(result.receiptNumber).toMatch(/^LAB-RCP-\d{8}-0001$/)
      expect(result.amount).toBe(250)
      expect(result.paymentMethod).toBe('CASH')
      expect(result.syncStatus).toBe('pending')

      const db = getDb()
      const stored = await db.payments.toArray()
      expect(stored).toHaveLength(1)
      expect(stored[0].patientRef).toBe('pat-123')
    })

    it('generates sequential receipt numbers for the same day', async () => {
      await recordPayment({
        patientRef: 'pat-1',
        testsPayedFor: [{ testCode: 'T1', testName: 'Test 1', price: 100 }],
        amount: 100,
        paymentMethod: 'CASH',
        cashierId: 'tech-001',
        outstandingBalance: 0,
      })

      const second = await recordPayment({
        patientRef: 'pat-2',
        testsPayedFor: [{ testCode: 'T2', testName: 'Test 2', price: 200 }],
        amount: 200,
        paymentMethod: 'CARD',
        cashierId: 'tech-001',
        outstandingBalance: 0,
      })

      expect(second.receiptNumber).toMatch(/-0002$/)
    })

    it('records partial payment with outstanding balance', async () => {
      const result = await recordPayment({
        patientRef: 'pat-partial',
        testsPayedFor: [
          { testCode: 'T1', testName: 'CBC', price: 250 },
          { testCode: 'T2', testName: 'Lipid Panel', price: 400 },
        ],
        amount: 300,
        paymentMethod: 'CASH',
        cashierId: 'tech-001',
        outstandingBalance: 350,
      })

      expect(result.amount).toBe(300)
      expect(result.outstandingBalance).toBe(350)
    })

    it('stores waiver reason when payment method is WAIVER', async () => {
      const result = await recordPayment({
        patientRef: 'pat-waiver',
        testsPayedFor: [{ testCode: 'T1', testName: 'CBC', price: 250 }],
        amount: 0,
        paymentMethod: 'WAIVER',
        cashierId: 'tech-001',
        outstandingBalance: 0,
        waiverReason: 'Patient cannot afford',
      })

      expect(result.waiverReason).toBe('Patient cannot afford')
    })

    it('stores insurance policy ref when payment method is INSURANCE', async () => {
      const result = await recordPayment({
        patientRef: 'pat-ins',
        testsPayedFor: [{ testCode: 'T1', testName: 'CBC', price: 250 }],
        amount: 250,
        paymentMethod: 'INSURANCE',
        cashierId: 'tech-001',
        outstandingBalance: 0,
        insurancePolicyRef: 'POL-123456',
      })

      expect(result.insurancePolicyRef).toBe('POL-123456')
    })

    it('emits PAYMENT_CREATED audit event', async () => {
      await recordPayment({
        patientRef: 'pat-audit',
        testsPayedFor: [{ testCode: 'T1', testName: 'CBC', price: 250 }],
        amount: 250,
        paymentMethod: 'CASH',
        cashierId: 'tech-001',
        outstandingBalance: 0,
      })

      expect(reportPaymentEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYMENT_CREATED',
          amount: 250,
          paymentMethod: 'CASH',
          cashierId: 'tech-001',
          patientRef: 'pat-audit',
        }),
      )
    })

    it('enqueues payment to syncQueue', async () => {
      await recordPayment({
        patientRef: 'pat-sync',
        testsPayedFor: [{ testCode: 'T1', testName: 'CBC', price: 250 }],
        amount: 250,
        paymentMethod: 'CASH',
        cashierId: 'tech-001',
        outstandingBalance: 0,
      })

      const db = getDb()
      const syncItems = await db.syncQueue.toArray()
      expect(syncItems).toHaveLength(1)
      expect(syncItems[0].resourceType).toBe('Payment')
    })
  })

  describe('getPaymentsForPatient', () => {
    it('returns payments ordered by date (newest first)', async () => {
      await recordPayment({
        patientRef: 'pat-multi',
        testsPayedFor: [{ testCode: 'T1', testName: 'CBC', price: 250 }],
        amount: 100,
        paymentMethod: 'CASH',
        cashierId: 'tech-001',
        outstandingBalance: 150,
      })

      await recordPayment({
        patientRef: 'pat-multi',
        testsPayedFor: [{ testCode: 'T1', testName: 'CBC', price: 250 }],
        amount: 150,
        paymentMethod: 'CASH',
        cashierId: 'tech-001',
        outstandingBalance: 0,
      })

      const payments = await getPaymentsForPatient('pat-multi')
      expect(payments).toHaveLength(2)
      // Newest first
      expect(payments[0].outstandingBalance).toBe(0)
    })
  })

  describe('getOutstandingBalance', () => {
    it('returns 0 for unknown patient', async () => {
      const balance = await getOutstandingBalance('unknown-patient')
      expect(balance).toBe(0)
    })

    it('returns most recent outstanding balance', async () => {
      await recordPayment({
        patientRef: 'pat-bal',
        testsPayedFor: [{ testCode: 'T1', testName: 'CBC', price: 500 }],
        amount: 200,
        paymentMethod: 'CASH',
        cashierId: 'tech-001',
        outstandingBalance: 300,
      })

      const balance = await getOutstandingBalance('pat-bal')
      expect(balance).toBe(300)
    })
  })

  describe('getPaymentsByDate', () => {
    it('returns payments for the given date', async () => {
      await recordPayment({
        patientRef: 'pat-date',
        testsPayedFor: [{ testCode: 'T1', testName: 'CBC', price: 250 }],
        amount: 250,
        paymentMethod: 'CASH',
        cashierId: 'tech-001',
        outstandingBalance: 0,
      })

      const todayStr = new Date().toISOString().slice(0, 10)
      const results = await getPaymentsByDate(todayStr)
      expect(results).toHaveLength(1)
    })

    it('returns empty for a different date', async () => {
      await recordPayment({
        patientRef: 'pat-date2',
        testsPayedFor: [{ testCode: 'T1', testName: 'CBC', price: 250 }],
        amount: 250,
        paymentMethod: 'CASH',
        cashierId: 'tech-001',
        outstandingBalance: 0,
      })

      const results = await getPaymentsByDate('2020-01-01')
      expect(results).toHaveLength(0)
    })
  })
})
