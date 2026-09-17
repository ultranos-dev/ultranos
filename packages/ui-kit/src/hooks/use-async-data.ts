import { useCallback, useEffect, useRef, useState } from 'react'
import type { DependencyList } from 'react'

export type AsyncStatus = 'loading' | 'error' | 'ready'

export interface AsyncData<T> {
  status: AsyncStatus
  data: T | undefined
  error: unknown
  /** true when the AUTHORITATIVE load succeeded; false when showing an offline-tolerant local fallback. */
  authoritative: boolean
  reload: () => void
}

export interface UseAsyncDataConfig<T> {
  /** Authoritative loader (Dexie for local-only surfaces; tRPC/Hub for remote; or a combined local+hub). Resolves the final data. */
  load: () => Promise<T>
  /** Optional local read used ONLY as an offline-tolerant fallback when `load` rejects. Never flips to 'ready' on its own — status stays 'loading' until `load` settles (this is the whole false-empty guarantee). */
  loadLocal?: () => Promise<T>
  /** Re-run when these change. */
  deps?: DependencyList
  /** When false, the hook does not load and stays 'loading' (caller gates rendering). Default true. */
  enabled?: boolean
  /** If `load` rejects but `loadLocal` resolved, show the local data as 'ready' (offline-tolerant) instead of 'error'. Default true. */
  offlineTolerant?: boolean
}

/**
 * 4-state async loader. "Empty" is only reachable in status 'ready' — never during
 * loading or on error — which prevents the false-negative "No X" flash. Mirrors the
 * allergy-store pattern: stays 'loading' through the optional local read AND the
 * authoritative load; offline-tolerant local fallback; stale-response guard; reload().
 */
export function useAsyncData<T>(config: UseAsyncDataConfig<T>): AsyncData<T> {
  const { load, loadLocal, deps = [], enabled = true, offlineTolerant = true } = config
  const [state, setState] = useState<{
    status: AsyncStatus
    data: T | undefined
    error: unknown
    authoritative: boolean
  }>({
    status: 'loading',
    data: undefined,
    error: undefined,
    authoritative: false,
  })
  const epochRef = useRef(0)
  const [reloadTick, setReloadTick] = useState(0)
  const reload = useCallback(() => setReloadTick((n) => n + 1), [])

  // Keep the latest loaders without retriggering the effect on every render.
  const loadRef = useRef(load)
  loadRef.current = load
  const loadLocalRef = useRef(loadLocal)
  loadLocalRef.current = loadLocal

  useEffect(() => {
    if (!enabled) return
    const epoch = ++epochRef.current
    setState({ status: 'loading', data: undefined, error: undefined, authoritative: false })

    let localData: T | undefined
    let localOk = false
    ;(async () => {
      if (loadLocalRef.current) {
        try {
          localData = await loadLocalRef.current()
          localOk = true
        } catch {
          localOk = false
        }
      }
      if (epochRef.current !== epoch) return // stale — a newer run started
      try {
        const result = await loadRef.current()
        if (epochRef.current !== epoch) return
        setState({ status: 'ready', data: result, error: undefined, authoritative: true })
      } catch (err) {
        if (epochRef.current !== epoch) return
        if (localOk && offlineTolerant) {
          setState({ status: 'ready', data: localData, error: undefined, authoritative: false })
        } else {
          setState({ status: 'error', data: undefined, error: err, authoritative: false })
        }
      }
    })()

    return () => {
      // invalidate in-flight on deps change / unmount
      epochRef.current++
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, offlineTolerant, reloadTick, ...deps])

  return { ...state, reload }
}
