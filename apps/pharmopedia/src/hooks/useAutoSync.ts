import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import { runSync } from '@/sync/catalog-sync'
import { getDatabase, isDatabaseReady } from '@/db/migrations'

/**
 * Auto-triggers a full catalog sync once per session when the user is
 * authenticated and has never synced (lastVersion === 0).
 *
 * Call this hook from the tabs layout so it runs as soon as the user
 * reaches the main app. The effect fires at most once — it guards against
 * re-runs while a sync is already in progress.
 */
export function useAutoSync() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const token = useAuthStore((s) => s.token)
  const lastVersion = useSyncStore((s) => s.lastVersion)
  const status = useSyncStore((s) => s.status)
  const setStatus = useSyncStore((s) => s.setStatus)
  const setSyncedCount = useSyncStore((s) => s.setSyncedCount)
  const setLastSync = useSyncStore((s) => s.setLastSync)

  useEffect(() => {
    if (!isAuthenticated || !token || lastVersion > 0 || status === 'syncing') return
    if (!isDatabaseReady()) return  // SQLite unavailable on this platform (e.g. web without WASM)

    let cancelled = false
    setStatus('syncing')

    runSync(getDatabase(), token, (count) => {
      if (!cancelled) setSyncedCount(count)
    })
      .then(({ version }) => {
        if (!cancelled) setLastSync(version, new Date().toISOString())
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  // isAuthenticated and token are the only reactive triggers.
  // lastVersion/status are read once as guards, not subscribed reactively.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token])
}
