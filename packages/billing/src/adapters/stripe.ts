import Stripe from 'stripe'
import type {
  BillingAdapter,
  SubscriptionResult,
  WebhookEvent,
  Invoice,
} from '../types.js'
import { BillingEventType } from '../types.js'

/**
 * Stripe billing adapter — Story 27.8 AC #2.
 * Implements the provider-agnostic BillingAdapter interface using the Stripe SDK.
 */
export class StripeAdapter implements BillingAdapter {
  private stripe: Stripe
  private webhookSecret: string
  private priceMap: Record<string, string>

  constructor(config: {
    secretKey: string
    webhookSecret: string
    priceMap: Record<string, string>
  }) {
    this.stripe = new Stripe(config.secretKey)
    this.webhookSecret = config.webhookSecret
    this.priceMap = config.priceMap
  }

  async createCustomer(
    orgId: string,
    billingEmail: string,
    name: string,
  ): Promise<string> {
    const customer = await this.stripe.customers.create({
      email: billingEmail,
      name,
      metadata: { org_id: orgId },
    })
    return customer.id
  }

  async createSubscription(
    customerId: string,
    moduleCode: string,
    priceId: string,
  ): Promise<SubscriptionResult> {
    const resolvedPriceId = this.priceMap[moduleCode]
    if (!resolvedPriceId) {
      throw new Error(
        `No price mapping found for module "${moduleCode}". Configure STRIPE_PRICE_MAP.`,
      )
    }
    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: resolvedPriceId }],
    })

    return {
      subscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    })
  }

  async handleWebhook(
    payload: string | Buffer,
    signature: string,
  ): Promise<WebhookEvent | null> {
    const event = this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret,
    )

    const eventTypeMap: Record<string, BillingEventType> = {
      'invoice.payment_succeeded': BillingEventType.CHARGE_SUCCESS,
      'invoice.payment_failed': BillingEventType.CHARGE_FAILED,
      'charge.refunded': BillingEventType.REFUND,
      'customer.subscription.created': BillingEventType.SUBSCRIPTION_CREATED,
      'customer.subscription.deleted': BillingEventType.SUBSCRIPTION_CANCELLED,
    }

    const billingEventType = eventTypeMap[event.type]
    if (!billingEventType) {
      // Unrecognized event — acknowledge but do not process
      return null
    }

    const obj = event.data.object as unknown as Record<string, unknown>

    let amount: number | undefined
    let currency: string | undefined

    if ('amount_paid' in obj) {
      amount = (obj.amount_paid as number) / 100
      currency = (obj.currency as string)?.toUpperCase()
    } else if ('amount' in obj) {
      amount = (obj.amount as number) / 100
      currency = (obj.currency as string)?.toUpperCase()
    }

    // Extract customer ID from the event object (present on invoice, charge, subscription objects)
    const customerId = typeof obj.customer === 'string' ? obj.customer : undefined

    // Extract subscription ID when available (present on invoice and subscription objects)
    const subscriptionId = typeof obj.subscription === 'string'
      ? obj.subscription
      : typeof obj.id === 'string' && event.type.startsWith('customer.subscription.')
        ? (obj.id as string)
        : undefined

    return {
      eventType: billingEventType,
      customerId,
      subscriptionId,
      amount,
      currency,
      providerRef: event.id,
      metadata: { stripeEventType: event.type },
    }
  }

  async getInvoices(customerId: string): Promise<Invoice[]> {
    const invoices = await this.stripe.invoices.list({
      customer: customerId,
      limit: 100,
    })

    return invoices.data.map((inv) => ({
      invoiceId: inv.id,
      amount: (inv.amount_paid ?? 0) / 100,
      currency: (inv.currency ?? 'usd').toUpperCase(),
      status: inv.status ?? 'unknown',
      pdfUrl: inv.invoice_pdf ?? undefined,
      createdAt: new Date(inv.created * 1000),
    }))
  }
}
