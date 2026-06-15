'use client'

/**
 * LockExpiryCheckerMount — Story 51.3: Sample Collision Prevention
 *
 * Thin client component that starts the lock expiry background checker
 * when the lab app is open. Renders nothing visible.
 * Placed in the locale layout so it runs for every authenticated page.
 */

import { useLockExpiryChecker } from '@/hooks/useLockExpiryChecker'

export function LockExpiryCheckerMount() {
  useLockExpiryChecker()
  return null
}
