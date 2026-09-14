import { ALL_LOCATIONS, DEFAULT_LOCATION_ID } from './types'
import type { StockLocation } from './types'

/** The concrete sub-location a write should tag. Never returns ALL_LOCATIONS:
 *  ALL / empty / invalid / retired resolves to the primary; only when no primary
 *  is cached does it fall back to DEFAULT_LOCATION_ID. */
export function resolveWriteLocation(currentLocationId: string, locations: StockLocation[]): string {
  if (currentLocationId && currentLocationId !== ALL_LOCATIONS) {
    if (currentLocationId === DEFAULT_LOCATION_ID) return DEFAULT_LOCATION_ID
    if (locations.some((l) => l.id === currentLocationId && l.isActive)) return currentLocationId
  }
  const primary = locations.find((l) => l.isPrimary && l.isActive)
  return primary?.id ?? DEFAULT_LOCATION_ID
}
