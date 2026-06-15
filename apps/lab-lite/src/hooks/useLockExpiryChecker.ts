/**
 * useLockExpiryChecker — Story 51.3: Sample Collision Prevention
 *
 * Hook that starts the lock expiry checker on mount and stops it on unmount.
 * Used in the main lab-lite layout component so checks run while the app is open.
 */

'use client'

import { useEffect } from 'react'
import { startExpiryChecker, stopExpiryChecker } from '@/lib/lock-expiry-checker'

export function useLockExpiryChecker(): void {
  useEffect(() => {
    startExpiryChecker()
    return () => {
      stopExpiryChecker()
    }
  }, [])
}
