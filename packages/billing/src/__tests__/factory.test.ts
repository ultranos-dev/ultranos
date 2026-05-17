import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock stripe before importing factory
vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => ({})),
  }
})

import { getBillingAdapter, resetBillingAdapter } from '../factory.js'
import { StripeAdapter } from '../adapters/stripe.js'
import { TapAdapter } from '../adapters/tap.js'

describe('getBillingAdapter()', () => {
  const originalEnv = process.env

  beforeEach(() => {
    resetBillingAdapter()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns StripeAdapter when BILLING_PROVIDER=stripe', () => {
    process.env.BILLING_PROVIDER = 'stripe'
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_xxx'

    const adapter = getBillingAdapter()
    expect(adapter).toBeInstanceOf(StripeAdapter)
  })

  it('returns StripeAdapter by default when BILLING_PROVIDER is unset', () => {
    delete process.env.BILLING_PROVIDER
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_xxx'

    const adapter = getBillingAdapter()
    expect(adapter).toBeInstanceOf(StripeAdapter)
  })

  it('returns TapAdapter when BILLING_PROVIDER=tap', () => {
    process.env.BILLING_PROVIDER = 'tap'
    process.env.TAP_API_KEY = 'sk_test_tap'
    process.env.TAP_WEBHOOK_SECRET = 'whsec_tap'

    const adapter = getBillingAdapter()
    expect(adapter).toBeInstanceOf(TapAdapter)
  })

  it('throws on unknown provider', () => {
    process.env.BILLING_PROVIDER = 'paypal'

    expect(() => getBillingAdapter()).toThrow(
      'Unknown billing provider: paypal. Supported: stripe, tap',
    )
  })

  it('returns the same singleton instance on subsequent calls', () => {
    process.env.BILLING_PROVIDER = 'stripe'
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_xxx'

    const a = getBillingAdapter()
    const b = getBillingAdapter()
    expect(a).toBe(b)
  })

  it('throws when required Stripe env vars are missing', () => {
    process.env.BILLING_PROVIDER = 'stripe'
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_WEBHOOK_SECRET

    expect(() => getBillingAdapter()).toThrow('Missing required Stripe env vars')
  })

  it('throws when required Tap env vars are missing', () => {
    process.env.BILLING_PROVIDER = 'tap'
    delete process.env.TAP_API_KEY
    delete process.env.TAP_WEBHOOK_SECRET

    expect(() => getBillingAdapter()).toThrow('Missing required Tap env vars')
  })

  it('throws when STRIPE_PRICE_MAP is invalid JSON', () => {
    process.env.BILLING_PROVIDER = 'stripe'
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_xxx'
    process.env.STRIPE_PRICE_MAP = 'not-json'

    expect(() => getBillingAdapter()).toThrow('STRIPE_PRICE_MAP must be valid JSON')
  })
})
