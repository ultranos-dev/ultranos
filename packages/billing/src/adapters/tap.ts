import type {
  BillingAdapter,
  SubscriptionResult,
  WebhookEvent,
  Invoice,
} from '../types.js'

/**
 * Tap Payments billing adapter — Story 27.8 AC #2 (stub).
 * MENA-specific alternative supporting SAR, AED, KWD, and other Gulf currencies.
 *
 * API mapping (for future implementation):
 * - createCustomer -> POST /v2/customers
 * - createSubscription -> Tap recurring payments API
 * - cancelSubscription -> DELETE /v2/subscriptions/{id}
 * - handleWebhook -> HMAC-SHA256 signature verification
 * - getInvoices -> GET /v2/invoices
 */
export class TapAdapter implements BillingAdapter {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_config: { apiKey: string; webhookSecret: string }) {
    // Config stored for future implementation
  }

  async createCustomer(
    _orgId: string,
    _billingEmail: string,
    _name: string,
  ): Promise<string> {
    throw new Error('Tap Payments adapter not yet implemented')
  }

  async createSubscription(
    _customerId: string,
    _moduleCode: string,
    _priceId: string,
  ): Promise<SubscriptionResult> {
    throw new Error('Tap Payments adapter not yet implemented')
  }

  async cancelSubscription(_subscriptionId: string): Promise<void> {
    throw new Error('Tap Payments adapter not yet implemented')
  }

  async handleWebhook(
    _payload: string | Buffer,
    _signature: string,
  ): Promise<WebhookEvent | null> {
    throw new Error('Tap Payments adapter not yet implemented')
  }

  async getInvoices(_customerId: string): Promise<Invoice[]> {
    throw new Error('Tap Payments adapter not yet implemented')
  }
}
