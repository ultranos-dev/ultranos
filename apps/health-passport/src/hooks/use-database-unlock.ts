/**
 * Hook to manage database unlock lifecycle.
 *
 * - Prompts biometric authentication on unlock
 * - Opens encrypted SQLCipher database connection
 * - Re-locks (closes DB) when app is backgrounded for >3 minutes
 *
 * AC3: Key stored in secure enclave
 * AC4: Biometric authentication required to unlock
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { unlockWithBiometrics, type UnlockResult } from '@/lib/mobile-key-service'
import { getEncryptedDbConnection, closeDatabase, isDatabaseOpen, markAuthenticated } from '@/lib/encrypted-db'

const BACKGROUND_LOCK_TIMEOUT_MS = 3 * 60 * 1000 // 3 minutes

export interface DatabaseUnlockState {
  isUnlocked: boolean
  isUnlocking: boolean
  error: string | null
  unlock: () => Promise<void>
  lock: () => Promise<void>
}

export function useDatabaseUnlock(): DatabaseUnlockState {
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const backgroundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const backgroundAtRef = useRef<number | null>(null)

  const lock = useCallback(async () => {
    await closeDatabase()
    setIsUnlocked(false)
    setError(null)
  }, [])

  const unlock = useCallback(async () => {
    if (isUnlocking) return // Prevent double-unlock race

    setIsUnlocking(true)
    setError(null)

    try {
      const result: UnlockResult = await unlockWithBiometrics()

      if (!result.success) {
        setError(result.reason)
        setIsUnlocking(false)
        return
      }

      markAuthenticated()
      await getEncryptedDbConnection()
      setIsUnlocked(true)
    } catch {
      setError('failed')
    } finally {
      setIsUnlocking(false)
    }
  }, [isUnlocking])

  // Background re-lock: close DB after 3 minutes in background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundAtRef.current = Date.now()

        // Schedule lock after 3 minutes
        if (backgroundTimerRef.current) {
          clearTimeout(backgroundTimerRef.current)
        }
        backgroundTimerRef.current = setTimeout(() => {
          if (isDatabaseOpen()) {
            void lock()
          }
        }, BACKGROUND_LOCK_TIMEOUT_MS)
      } else if (nextState === 'active') {
        // Returned to foreground
        if (backgroundTimerRef.current) {
          clearTimeout(backgroundTimerRef.current)
          backgroundTimerRef.current = null
        }

        // Check if we were backgrounded for >3 minutes
        if (backgroundAtRef.current) {
          const elapsed = Date.now() - backgroundAtRef.current
          backgroundAtRef.current = null

          if (elapsed >= BACKGROUND_LOCK_TIMEOUT_MS && isDatabaseOpen()) {
            void lock()
          }
        }
      }
    })

    return () => {
      subscription.remove()
      if (backgroundTimerRef.current) {
        clearTimeout(backgroundTimerRef.current)
      }
    }
  }, [lock])

  return { isUnlocked, isUnlocking, error, unlock, lock }
}
