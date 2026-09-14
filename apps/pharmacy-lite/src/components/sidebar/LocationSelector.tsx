'use client'

import { useTranslations } from 'next-intl'
import { useLocationStore } from '@/stores/location-store'
import { ALL_LOCATIONS, DEFAULT_LOCATION_ID } from '@/lib/inventory/types'

export function LocationSelector() {
  const t = useTranslations('locations')
  const locations = useLocationStore((s) => s.locations)
  const currentLocationId = useLocationStore((s) => s.currentLocationId)
  const setCurrentLocation = useLocationStore((s) => s.setCurrentLocation)

  const isEmpty = locations.length === 0

  return (
    <select
      role="combobox"
      aria-label={t('selectorLabel')}
      className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm w-full"
      value={isEmpty ? DEFAULT_LOCATION_ID : currentLocationId}
      onChange={(e) => setCurrentLocation(e.target.value)}
      disabled={isEmpty}
    >
      {isEmpty ? (
        <option value={DEFAULT_LOCATION_ID}>{t('defaultLocation')}</option>
      ) : (
        <>
          <option value={ALL_LOCATIONS}>{t('allLocations')}</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </>
      )}
    </select>
  )
}
