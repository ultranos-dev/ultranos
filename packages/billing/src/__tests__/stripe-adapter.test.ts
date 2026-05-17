import { describe, it, expect, vi, beforeEach } from 'vitest'

// Create mock Stripe methods
const mockCustomersCreate = vi.fn()
const mockSubscriptionsCreate = vi.fn()
const mockSubscriptionsUpdate = vi.fn()
const mockInvoicesList = vi.fn()
const mockWebhooksConstructEvent = vi.fn()

vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      customers: { create: mockCustomersCreate },
      subscriptions: { create: mockSubscriptionsCreate, update: mockSubscriptionsUpdate },
      invoices: { list: mockInvoicesList },
      webhooks: { constructEvent: mockWebhooksConstructEvent },
    })),
  }
})

import { StripeAdapter } from '../adapters/stripe.js'
import { BillingEventType } from '../types.js'

describe('StripeAdapter', () => {
  let adapter: StripeAdapter

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = new StripeAdapter({
      secretKey: 'sk_test_xxx',
      webhookSecret: 'whsec_xxx',
      priceMap: { OPD_LITE: 'price_opd', LAB_LITE: 'price_lab' },
    })
  })

  describe('createCustomer()', () => {
    it('calls stripe.customers.create with correct params', async () => {
      mockCustomersCreate.mockResolvedValue({ id: 'cus_123' })

      const result = await adapter.createCustomer('org-1', 'billing@test.com', 'Test Org')

      expect(mockCustomersCreate).toHaveBeenCalledWith({
        email: 'billing@test.com',
        name: 'Test Org',
        metadata: { org_id: 'org-1' },
      })
      expect(result).toBe('cus_123')
    })
  })

  describe('createSubscription()', () => {
    it('maps module codes to price IDs from priceMap', async () => {
      mockSubscriptionsCreate.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        current_period_end: 1700000000,
      })

      const result = await adapter.createSubscription('cus_123', 'OPD_LITE', 'price_fallback')

      expect(mockSubscriptionsCreate).toHaveBeenCalledWith({
        customer: 'cus_123',
        items: [{ price: 'price_opd' }],
      })
      expect(result).toEqual({
        subscriptionId: 'sub_123',
        status: 'active',
        currentPeriodEnd: new Date(1700000000 * 1000),
      })
    })

    it('throws when module code is not in priceMap', async () => {
      await expect(
        adapter.createSubscription('cus_123', 'UNKNOWN_MODULE', 'price_manual'),
      ).rejects.toThrow('No price mapping found for module "UNKNOWN_MODULE"')
    })
  })

  describe('cancelSubscription()', () => {
    it('uses cancel_at_period_end: true', async () => {
      mockSubscriptionsUpdate.mockResolvedValue({})

      await adapter.cancelSubscription('sub_123')

      expect(mockSubscriptionsUpdate).toHaveBeenCalledWith('sub_123', {
        cancel_at_period_end: true,
      })
    })
  })

  describe('handleWebhook()', () => {
    it('verifies signature and maps invoice.payment_succeeded to CHARGE_SUCCESS', async () => {
      mockWebhooksConstructEvent.mockReturnValue({
        id: 'evt_123',
        type: 'invoice.payment_succeeded',
        data: {
          object: { amount_paid: 5000, currency: 'usd', customer: 'cus_abc', subscription: 'sub_xyz' },
        },
      })

      const result = await adapter.handleWebhook('payload', 'sig_header')

      expect(mockWebhooksConstructEvent).toHaveBeenCalledWith('payload', 'sig_header', 'whsec_xxx')
      expect(result).not.toBeNull()
      expect(result!.eventType).toBe(BillingEventType.CHARGE_SUCCESS)
      expect(result!.amount).toBe(50)
      expect(result!.currency).toBe('USD')
      expect(result!.providerRef).toBe('evt_123')
      expect(result!.customerId).toBe('cus_abc')
      expect(result!.subscriptionId).toBe('sub_xyz')
    })

    it('maps invoice.payment_failed to CHARGE_FAILED', async () => {
      mockWebhooksConstructEvent.mockReturnValue({
        id: 'evt_456',
        type: 'invoice.payment_failed',
        data: { object: { amount_paid: 2000, currency: 'usd', customer: 'cus_abc' } },
      })

      const result = await adapter.handleWebhook('payload', 'sig')
      expect(result).not.toBeNull()
      expect(result!.eventType).toBe(BillingEventType.CHARGE_FAILED)
    })

    it('maps charge.refunded to REFUND', async () => {
      mockWebhooksConstructEvent.mockReturnValue({
        id: 'evt_789',
        type: 'charge.refunded',
        data: { object: { amount: 3000, currency: 'usd', customer: 'cus_abc' } },
      })

      const result = await adapter.handleWebhook('payload', 'sig')
      expect(result).not.toBeNull()
      expect(result!.eventType).toBe(BillingEventType.REFUND)
      expect(result!.amount).toBe(30)
    })

    it('maps customer.subscription.created to SUBSCRIPTION_CREATED', async () => {
      mockWebhooksConstructEvent.mockReturnValue({
        id: 'evt_sub_1',
        type: 'customer.subscription.created',
        data: { object: { id: 'sub_new', customer: 'cus_abc' } },
      })

      const result = await adapter.handleWebhook('payload', 'sig')
      expect(result).not.toBeNull()
      expect(result!.eventType).toBe(BillingEventType.SUBSCRIPTION_CREATED)
      expect(result!.subscriptionId).toBe('sub_new')
    })

    it('maps customer.subscription.deleted to SUBSCRIPTION_CANCELLED', async () => {
      mockWebhooksConstructEvent.mockReturnValue({
        id: 'evt_sub_2',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_del', customer: 'cus_abc' } },
      })

      const result = await adapter.handleWebhook('payload', 'sig')
      expect(result).not.toBeNull()
      expect(result!.eventType).toBe(BillingEventType.SUBSCRIPTION_CANCELLED)
    })

    it('returns null for unrecognized event types', async () => {
      mockWebhooksConstructEvent.mockReturnValue({
        id: 'evt_unknown',
        type: 'customer.updated',
        data: { object: {} },
      })

      const result = await adapter.handleWebhook('payload', 'sig')
      expect(result).toBeNull()
    })
  })

  describe('getInvoices()', () => {
    it('returns formatted invoice list', async () => {
      mockInvoicesList.mockResolvedValue({
        data: [
          {
            id: 'inv_1',
            amount_paid: 5000,
            currency: 'usd',
            status: 'paid',
            invoice_pdf: 'https://stripe.com/inv_1.pdf',
            created: 1700000000,
          },
          {
            id: 'inv_2',
            amount_paid: 0,
            currency: 'usd',
            status: 'draft',
            invoice_pdf: null,
            created: 1700100000,
          },
        ],
      })

      const invoices = await adapter.getInvoices('cus_123')

      expect(mockInvoicesList).toHaveBeenCalledWith({
        customer: 'cus_123',
        limit: 100,
      })
      expect(invoices).toHaveLength(2)
      expect(invoices[0]).toEqual({
        invoiceId: 'inv_1',
        amount: 50,
        currency: 'USD',
        status: 'paid',
        pdfUrl: 'https://stripe.com/inv_1.pdf',
        createdAt: new Date(1700000000 * 1000),
      })
      expect(invoices[1]?.pdfUrl).toBeUndefined()
    })
  })
})
