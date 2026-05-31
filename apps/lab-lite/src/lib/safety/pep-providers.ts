import { getDb } from '@/lib/db'

export interface PepProvider {
  id: string
  name: string
  phone: string
  address: string
  hours: string
  distance?: string
  priority: number  // admin-configured display order (lower = first)
}

/**
 * Returns all configured PEP providers sorted by priority (ascending).
 * Providers are configured by admin via the Hub and synced down — never hardcoded.
 * Returns empty array if the table does not exist or on any error.
 */
export async function getPepProviders(): Promise<PepProvider[]> {
  try {
    const db = getDb()
    const providers = await (db as any).pep_providers.toArray() as PepProvider[]
    return providers.sort((a, b) => a.priority - b.priority)
  } catch {
    return []
  }
}

/**
 * Upserts a PEP provider record into local storage.
 * Used when syncing provider data from the Hub.
 */
export async function putPepProvider(provider: PepProvider): Promise<void> {
  try {
    await (getDb() as any).pep_providers.put(provider)
  } catch {
    // Silently swallow — pep_providers table may not exist in older db versions
  }
}

/**
 * Returns an empty array — providers are configured by admin, not hardcoded.
 * Placeholder for future seeding logic.
 */
export function getDefaultPepProviders(): PepProvider[] {
  return []
}
