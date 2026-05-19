/**
 * useSubscriptionMonitor — monitors IAP subscription status on app startup.
 * Story 27.12, Task 6.
 *
 * On mount: checks store for active subscription → syncs tier state.
 * Registers purchase listeners for background renewal/cancellation events.
 * Grace period: if store reports active, premium features remain accessible.
 */
import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { usePatientTierStore } from '@/stores/patient-tier-store'
import {
  initIAP,
  getActiveSubscription,
  registerPurchaseListeners,
  cleanupIAP,
  type Purchase,
} from '@/services/iap-service'
import { SUBSCRIPTION_SKUS } from '@/config/iap'

/**
 * Hook to monitor subscription status changes.
 * Should be called once at app root level.
 */
export function useSubscriptionMonitor(): void {
  const setPatientTier = usePatientTierStore((s) => s.setPatientTier)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)

  // Check subscription status on mount and when app returns to foreground
  useEffect(() => {
    let mounted = true
    let cleanupListeners: (() => void) | null = null

    async function checkSubscriptionStatus() {
      try {
        await initIAP()
        const activeSub = await getActiveSubscription()

        if (!mounted) return

        // Read current tier from store at resolution time, not at mount time,
        // to avoid stale closure overriding a tier change made by handleSubscribe
        const currentTier = usePatientTierStore.getState().patientTier

        if (activeSub) {
          // Store reports active subscription — ensure tier is PREMIUM
          // This covers grace period: store still reports active during grace window
          if (currentTier !== 'PREMIUM') {
            setPatientTier('PREMIUM')
          }
        } else {
          // No active subscription from store — revert to FREE if currently PREMIUM
          // This handles: subscription expired, payment failed, refund
          if (currentTier === 'PREMIUM') {
            setPatientTier('FREE')
          }
        }
      } catch {
        // IAP check failure is non-fatal — keep current tier
        // The Hub API webhook is the source of truth for server-side state
      }
    }

    // Initial check
    checkSubscriptionStatus()

    // Register purchase update listeners for real-time status changes
    cleanupListeners = registerPurchaseListeners(
      (purchase: Purchase) => {
        // Purchase updated — check if it's our subscription
        if (SUBSCRIPTION_SKUS.includes(purchase.productId)) {
          setPatientTier('PREMIUM')
        }
      },
      () => {
        // Purchase error — non-fatal, keep current state
      },
    )

    // Re-check when app returns to foreground
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        checkSubscriptionStatus()
      }
      appStateRef.current = nextState
    })

    return () => {
      mounted = false
      cleanupListeners?.()
      subscription.remove()
      cleanupIAP()
    }
  }, []) // Only run on mount — setPatientTier is stable (Zustand)
}
