import type { BillingAdapter } from './types.js'
import { StripeAdapter } from './adapters/stripe.js'
import { TapAdapter } from './adapters/tap.js'

let cachedAdapter: BillingAdapter | null = null

/**
 * Adapter factory — Story 27.8 AC #3.
 * Returns a billing adapter based on the BILLING_PROVIDER env var.
 * Lazy-singleton: the same instance is returned on subsequent calls.
 */
export function getBillingAdapter(): BillingAdapter {
  if (cachedAdapter) return cachedAdapter

  const provider = (process.env.BILLING_PROVIDER ?? 'stripe').toLowerCase()

  switch (provider) {
    case 'stripe': {
      const secretKey = process.env.STRIPE_SECRET_KEY
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
      const priceMapRaw = process.env.STRIPE_PRICE_MAP

      if (!secretKey || !webhookSecret) {
        throw new Error(
          'Missing required Stripe env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET',
        )
      }

      let priceMap: Record<string, string> = {}
      if (priceMapRaw) {
        try {
          priceMap = JSON.parse(priceMapRaw) as Record<string, string>
        } catch {
          throw new Error('STRIPE_PRICE_MAP must be valid JSON')
        }
      }

      cachedAdapter = new StripeAdapter({ secretKey, webhookSecret, priceMap })
      break
    }

    case 'tap': {
      const apiKey = process.env.TAP_API_KEY
      const webhookSecret = process.env.TAP_WEBHOOK_SECRET

      if (!apiKey || !webhookSecret) {
        throw new Error(
          'Missing required Tap env vars: TAP_API_KEY, TAP_WEBHOOK_SECRET',
        )
      }

      cachedAdapter = new TapAdapter({ apiKey, webhookSecret })
      break
    }

    default:
      throw new Error(
        `Unknown billing provider: ${provider}. Supported: stripe, tap`,
      )
  }

  return cachedAdapter
}

/**
 * Reset the cached adapter — used in tests only.
 */
export function resetBillingAdapter(): void {
  cachedAdapter = null
}
