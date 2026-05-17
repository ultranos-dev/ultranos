/**
 * Billing adapter types — Story 27.8 AC #1.
 * Provider-agnostic billing interface supporting Stripe and Tap Payments.
 */

export enum BillingEventType {
  CHARGE_SUCCESS = 'CHARGE_SUCCESS',
  CHARGE_FAILED = 'CHARGE_FAILED',
  REFUND = 'REFUND',
  SUBSCRIPTION_CREATED = 'SUBSCRIPTION_CREATED',
  SUBSCRIPTION_CANCELLED = 'SUBSCRIPTION_CANCELLED',
}

export interface SubscriptionResult {
  subscriptionId: string
  status: string
  currentPeriodEnd: Date
}

export interface WebhookEvent {
  eventType: BillingEventType
  orgId?: string
  customerId?: string
  subscriptionId?: string
  amount?: number
  currency?: string
  providerRef: string
  metadata?: Record<string, unknown>
}

export interface Invoice {
  invoiceId: string
  amount: number
  currency: string
  status: string
  pdfUrl?: string
  createdAt: Date
}

export interface BillingAdapter {
  createCustomer(orgId: string, billingEmail: string, name: string): Promise<string>
  createSubscription(customerId: string, moduleCode: string, priceId: string): Promise<SubscriptionResult>
  cancelSubscription(subscriptionId: string): Promise<void>
  handleWebhook(payload: string | Buffer, signature: string): Promise<WebhookEvent | null>
  getInvoices(customerId: string): Promise<Invoice[]>
}
