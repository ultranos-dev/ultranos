/**
 * In-App Purchase configuration — Story 27.12, Task 1.3.
 *
 * Product IDs registered in both Google Play Console and App Store Connect.
 * Single subscription product: monthly premium.
 */
import { Platform } from 'react-native'

/** Subscription product ID — same SKU on both stores unless overridden. */
export const IAP_PRODUCT_IDS = {
  PREMIUM_MONTHLY: 'ultranos_premium_monthly',
} as const

/**
 * Returns the platform-appropriate product ID.
 * Both stores use the same ID by default; override here if they diverge.
 */
export function getPremiumProductId(): string {
  if (Platform.OS === 'ios') {
    return IAP_PRODUCT_IDS.PREMIUM_MONTHLY
  }
  return IAP_PRODUCT_IDS.PREMIUM_MONTHLY
}

/** All subscription SKUs to fetch from the store. */
export const SUBSCRIPTION_SKUS = [IAP_PRODUCT_IDS.PREMIUM_MONTHLY]
