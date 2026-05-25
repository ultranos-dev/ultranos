import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getHubApiUrl } from '@/lib/trpc'
import type { NetworkStockItem } from './types'

export async function queryNetworkStock(params: {
  catalogItemId?: string
  organizationId?: string
  signal?: AbortSignal
}): Promise<NetworkStockItem[]> {
  try {
    const token = await useAuthSessionStore.getState().getAccessToken()
    const url = new URL(`${getHubApiUrl()}/inventory.networkStock`)
    if (params.catalogItemId) url.searchParams.set('catalogItemId', params.catalogItemId)
    if (params.organizationId) url.searchParams.set('organizationId', params.organizationId)

    const res = await fetch(url.toString(), {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: params.signal,
    })

    if (!res.ok) return []

    const data = await res.json() as { result?: { data?: NetworkStockItem[] } }
    return data?.result?.data ?? []
  } catch {
    // Offline-safe: return empty rather than throwing
    return []
  }
}

export async function queryNetworkStockBulk(params: {
  catalogItemIds: string[]
  signal?: AbortSignal
}): Promise<NetworkStockItem[]> {
  try {
    const token = await useAuthSessionStore.getState().getAccessToken()

    const res = await fetch(`${getHubApiUrl()}/inventory.networkStockBulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ json: { catalogItemIds: params.catalogItemIds } }),
      signal: params.signal,
    })

    if (!res.ok) return []

    const data = await res.json() as { result?: { data?: NetworkStockItem[] } }
    return data?.result?.data ?? []
  } catch {
    // Offline-safe: return empty rather than throwing
    return []
  }
}
