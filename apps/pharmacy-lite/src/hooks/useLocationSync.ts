import { useEffect } from 'react'
import { syncLocationsFromHub } from '@/lib/inventory/location-sync'
import { useLocationStore } from '@/stores/location-store'

export function useLocationSync() {
  useEffect(() => {
    const controller = new AbortController()
    async function run() {
      await useLocationStore.getState().loadLocations()   // always: populate from cache (works offline)
      if (!navigator.onLine) return
      try {
        await syncLocationsFromHub(controller.signal)
        if (!controller.signal.aborted) await useLocationStore.getState().loadLocations()
      } catch {
        // non-blocking — offline / Hub unavailable
      }
    }
    run()
    return () => { controller.abort() }
  }, [])
}
