/**
 * IAP Service — In-App Purchase lifecycle management.
 * Story 27.12, Task 2.
 *
 * Wraps react-native-iap for cross-platform subscription management.
 * Handles: connection init, product fetch, purchase, restore, listeners, cleanup.
 */
import { Platform } from 'react-native'
import {
  initConnection,
  endConnection,
  getSubscriptions,
  requestSubscription,
  getAvailablePurchases,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  flushFailedPurchasesCachedAsPendingAndroid,
  type ProductPurchase,
  type PurchaseError,
  type SubscriptionPurchase,
  type Subscription,
} from 'react-native-iap'
import { SUBSCRIPTION_SKUS } from '@/config/iap'

export type IAPProduct = Subscription
export type Purchase = ProductPurchase | SubscriptionPurchase

let connectionInitialized = false
let connectionPromise: Promise<void> | null = null
let purchaseUpdateSubscription: { remove: () => void } | null = null
let purchaseErrorSubscription: { remove: () => void } | null = null

/**
 * Initialize IAP connection. Must be called before any other IAP operation.
 * Safe to call concurrently — uses a promise lock so only one initConnection()
 * executes and all concurrent callers share the same result.
 */
export async function initIAP(): Promise<void> {
  if (connectionInitialized) return
  if (connectionPromise) return connectionPromise

  connectionPromise = (async () => {
    await initConnection()
    connectionInitialized = true

    // Android: flush stale pending purchases from cache
    if (Platform.OS === 'android') {
      await flushFailedPurchasesCachedAsPendingAndroid().catch(() => {
        // Non-fatal — stale cache will resolve on next purchase
      })
    }
  })()

  try {
    await connectionPromise
  } finally {
    connectionPromise = null
  }
}

/**
 * Fetch the premium subscription product with localized price info.
 * Returns null if product is unavailable in the store.
 */
export async function getSubscriptionProduct(): Promise<IAPProduct | null> {
  const products = await getSubscriptions({ skus: SUBSCRIPTION_SKUS })
  return products.length > 0 ? products[0] : null
}

/**
 * Initiate the platform purchase flow for a subscription.
 * Returns the purchase object on success; throws on failure/cancellation.
 */
export async function purchaseSubscription(
  productId: string,
): Promise<Purchase> {
  const purchase = await requestSubscription({ sku: productId })
  // requestSubscription can return a single purchase or array depending on platform
  if (Array.isArray(purchase)) {
    if (purchase.length === 0) {
      throw new Error('Purchase returned empty result')
    }
    return purchase[0]
  }
  return purchase as Purchase
}

/**
 * Check for an active subscription from store receipts.
 * Used on app launch to verify subscription status.
 */
export async function getActiveSubscription(): Promise<Purchase | null> {
  const purchases = await getAvailablePurchases()
  // Find the most recent subscription purchase
  const subscriptionPurchase = purchases
    .filter((p) => SUBSCRIPTION_SKUS.includes(p.productId))
    .sort((a, b) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0))[0]
  return subscriptionPurchase ?? null
}

/**
 * Restore previous purchases — for account recovery scenarios.
 * Returns all restorable subscription purchases.
 */
export async function restorePurchases(): Promise<Purchase[]> {
  const purchases = await getAvailablePurchases()
  return purchases.filter((p) => SUBSCRIPTION_SKUS.includes(p.productId))
}

/**
 * Acknowledge a purchase with the store to prevent re-delivery.
 * MUST be called after successful server-side validation.
 */
export async function acknowledgePurchase(purchase: Purchase): Promise<void> {
  await finishTransaction({ purchase, isConsumable: false })
}

/**
 * Register listeners for real-time purchase updates (renewal, cancellation).
 * Returns a cleanup function to remove listeners.
 */
export function registerPurchaseListeners(
  onPurchaseUpdate: (purchase: Purchase) => void,
  onPurchaseError: (error: PurchaseError) => void,
): () => void {
  // Remove any existing listeners first
  cleanupListeners()

  purchaseUpdateSubscription = purchaseUpdatedListener(onPurchaseUpdate)
  purchaseErrorSubscription = purchaseErrorListener(onPurchaseError)

  return cleanupListeners
}

/**
 * Clean up IAP connection and listeners.
 * Call on app background/unmount.
 */
export async function cleanupIAP(): Promise<void> {
  cleanupListeners()
  if (connectionInitialized) {
    await endConnection()
    connectionInitialized = false
  }
}

function cleanupListeners(): void {
  purchaseUpdateSubscription?.remove()
  purchaseUpdateSubscription = null
  purchaseErrorSubscription?.remove()
  purchaseErrorSubscription = null
}
