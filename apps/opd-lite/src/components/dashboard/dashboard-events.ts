/**
 * Lightweight event bus for dashboard card refresh triggers.
 * Used by the Realtime subscription to force cards to re-fetch
 * without waiting for their polling interval.
 */
const REFRESH_EVENT = 'ultranos:dashboard-refresh'

export type DashboardRefreshType = 'lab-result' | 'sync-conflict' | 'notification' | 'all'

export function emitDashboardRefresh(type: DashboardRefreshType = 'all'): void {
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT, { detail: { type } }))
}

export function onDashboardRefresh(
  callback: (type: DashboardRefreshType) => void
): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ type: DashboardRefreshType }>).detail
    callback(detail.type)
  }
  window.addEventListener(REFRESH_EVENT, handler)
  return () => window.removeEventListener(REFRESH_EVENT, handler)
}
