import { useCallback, useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import { runSync } from '@/sync/catalog-sync'
import { runBrandsSync } from '@/sync/brands-sync'
import { getDatabase, isDatabaseReady } from '@/db/migrations'

/** Skip a delta re-sync if we synced within this window (avoids redundant churn). */
const THROTTLE_MS = 15 * 60 * 1000
/** Foreground heartbeat: re-check for catalog deltas every 30 min while the app is open. */
const INTERVAL_MS = 30 * 60 * 1000

/**
 * Keeps the offline catalog fresh:
 *  - first launch (lastVersion === 0): full sync with the progress UI
 *  - returning users: a silent delta sync on sign-in, on app foreground, and on
 *    a 30-min interval while the app is open
 *
 * All triggers are online-gated, throttled (15 min), and single-flight. Delta
 * syncs never touch the sync status, so they don't flash the "syncing" banner.
 * (True OS background sync — app closed — is intentionally out of scope.)
 */
export function useAutoSync() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const token = useAuthStore((s) => s.token)
  const lastVersion = useSyncStore((s) => s.lastVersion)
  const status = useSyncStore((s) => s.status)
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt)
  const setStatus = useSyncStore((s) => s.setStatus)
  const setSyncedCount = useSyncStore((s) => s.setSyncedCount)
  const setLastSync = useSyncStore((s) => s.setLastSync)

  // Latest reactive values, so the interval/AppState callbacks never go stale.
  const snap = useRef({ isAuthenticated, token, lastVersion, status, lastSyncAt })
  snap.current = { isAuthenticated, token, lastVersion, status, lastSyncAt }
  const running = useRef(false)

  const doSync = useCallback(async () => {
    const s = snap.current
    if (running.current || s.status === 'syncing') return
    if (!s.isAuthenticated || !s.token || !isDatabaseReady()) return

    const cold = s.lastVersion === 0
    // Returning users: skip if we synced very recently.
    if (!cold && s.lastSyncAt && Date.now() - Date.parse(s.lastSyncAt) < THROTTLE_MS) return

    // Online-gate — never burn metered data when offline.
    const net = await NetInfo.fetch().catch(() => null)
    if (!net || net.isConnected === false || net.isInternetReachable === false) return

    running.current = true
    if (cold) setStatus('syncing') // only the first-run cold sync shows progress UI
    try {
      const { version } = await runSync(getDatabase(), s.token, cold ? (c) => setSyncedCount(c) : undefined)
      await runBrandsSync(getDatabase(), s.token).catch(() => {})
      setLastSync(version, new Date().toISOString())
    } catch {
      if (cold) setStatus('error') // delta failures stay silent
    } finally {
      running.current = false
    }
  }, [setStatus, setSyncedCount, setLastSync])

  // Sign-in / app open.
  useEffect(() => {
    if (isAuthenticated && token) void doSync()
  }, [isAuthenticated, token, doSync])

  // Foreground + 30-min interval, only while signed in.
  useEffect(() => {
    if (!isAuthenticated || !token) return
    const sub = AppState.addEventListener('change', (next) => { if (next === 'active') void doSync() })
    const id = setInterval(() => { void doSync() }, INTERVAL_MS)
    return () => { sub.remove(); clearInterval(id) }
  }, [isAuthenticated, token, doSync])
}
