/**
 * collection-mode.ts — Collection Only Mode Gate
 * Story 54.1 / Task 9
 *
 * A location in "collection-only" mode shows only the patient registration,
 * sample collection, and upload queue sections. Result entry, QC, and
 * inventory management are hidden via CollectionModeGate.
 *
 * The current location's mode is stored in Dexie. When offline, the last
 * known mode is used.
 */

import { getDb } from '@/lib/db'

const CURRENT_LOCATION_KEY = 'ultranos_current_location_id'

/**
 * Persist the current location ID to localStorage.
 * Called when a user logs in at a specific lab location.
 */
export function setCurrentLocationId(locationId: string): void {
  try {
    localStorage.setItem(CURRENT_LOCATION_KEY, locationId)
  } catch {
    // localStorage unavailable (private browsing, storage full) — non-fatal
  }
}

/** Get the current location ID from localStorage. Returns null if not set. */
export function getCurrentLocationId(): string | null {
  try {
    return localStorage.getItem(CURRENT_LOCATION_KEY)
  } catch {
    return null
  }
}

/**
 * Returns true if the current location is configured in "collection-only" mode.
 * Falls back to false (full mode) if the location cannot be loaded.
 */
export async function isCollectionOnlyMode(): Promise<boolean> {
  const locationId = getCurrentLocationId()
  if (!locationId) return false

  try {
    const db = getDb()
    const location = await db.lab_locations.get(locationId)
    return location?.mode === 'collection-only'
  } catch {
    return false
  }
}
