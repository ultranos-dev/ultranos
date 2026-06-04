import { useLocationStore, ALL_LOCATIONS } from '@/stores/location-store'

/**
 * Returns the selected location ID for filtering tRPC queries.
 * Returns undefined when "All Locations" is selected (no filter).
 */
export function useLocationFilter(): { locationId: string | undefined; locationName: string } {
  const selected = useLocationStore((s) => s.selected)

  return {
    locationId: selected.id === ALL_LOCATIONS.id ? undefined : selected.id,
    locationName: selected.name,
  }
}
