/**
 * Hook to manage database unlock lifecycle.
 *
 * - Prompts biometric authentication on unlock
 * - Opens encrypted SQLCipher database connection
 * - Starts the sync DrainWorker + wires the consent dual-write queue on unlock
 * - Re-locks (closes DB, stops drain) when app is backgrounded for >3 minutes
 *
 * AC3: Key stored in secure enclave
 * AC4: Biometric authentication required to unlock
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { unlockWithBiometrics, type UnlockResult } from '@/lib/mobile-key-service'
import { getEncryptedDbConnection, closeDatabase, isDatabaseOpen, markAuthenticated } from '@/lib/encrypted-db'
import { startDrainWorker, stopDrainWorker, isDrainWorkerRunning } from '@/lib/sync-drain-init'
import type { DrainSyncConfig } from '@/lib/drain-sync-fn'
import { setSyncEngineQueue } from '@/lib/consent-sync'

const BACKGROUND_LOCK_TIMEOUT_MS = 3 * 60 * 1000 // 3 minutes

/**
 * Config for the drain worker's Hub sync function.
 *
 * - getAuthToken: current Supabase access token (in-memory only), or null if
 *   the session is missing/expired — drain-sync-fn treats null as auth-expired
 *   and pauses without exhausting retries. supabase is imported lazily so the
 *   heavy auth client only loads when the drain worker actually dispatches.
 * - getHubUrl: Hub API origin. drain-sync-fn appends resource endpoints
 *   (e.g. /api/consent.sync), so this must be the origin, not the tRPC path.
 */
const drainSyncConfig: DrainSyncConfig = {
  getAuthToken: async () => {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data } = await supabase.auth.getSession()
      return data.session?.access_token ?? null
    } catch {
      return null
    }
  },
  getHubUrl: () => {
    const raw = process.env.EXPO_PUBLIC_HUB_API_URL ?? 'http://localhost:3004'
    // Strip a trailing tRPC path if present — resource endpoints are appended by drain-sync-fn.
    try {
      const u = new URL(raw)
      return `${u.protocol}//${u.host}`
    } catch {
      return raw.replace(/\/api\/trpc\/?$/, '')
    }
  },
}

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
  const isUnlockingRef = useRef(false)

  const lock = useCallback(async () => {
    // Stop the drain worker and detach the consent dual-write queue before the
    // DB handle is closed — the worker's storage adapter is backed by this DB.
    stopDrainWorker()
    setSyncEngineQueue(null)

    try {
      await closeDatabase()
    } catch {
      // Best-effort — DB handle may already be closed
    }
    setIsUnlocked(false)
    setError(null)
  }, [])

  const unlock = useCallback(async () => {
    if (isUnlockingRef.current) return // Prevent double-unlock race via ref
    isUnlockingRef.current = true

    setIsUnlocking(true)
    setError(null)

    try {
      const result: UnlockResult = await unlockWithBiometrics()

      if (!result.success) {
        setError(result.reason)
        setIsUnlocking(false)
        isUnlockingRef.current = false
        return
      }

      markAuthenticated(result.unlockToken)
      const db = await getEncryptedDbConnection()

      // Start the drain worker now that the encrypted DB is open. Guarded by
      // isDrainWorkerRunning() so a re-unlock never starts it twice; the returned
      // sync-engine queue is wired into consent-sync for dual-write dispatch.
      if (!isDrainWorkerRunning()) {
        const queue = startDrainWorker(db, drainSyncConfig)
        setSyncEngineQueue(queue)
      }

      setIsUnlocked(true)
    } catch {
      setError('failed')
    } finally {
      setIsUnlocking(false)
      isUnlockingRef.current = false
    }
  }, [])

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
            lock().catch(() => { /* best-effort background lock */ })
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
            lock().catch(() => { /* best-effort foreground re-lock */ })
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
