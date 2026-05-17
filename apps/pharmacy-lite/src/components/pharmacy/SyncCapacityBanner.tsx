'use client'

import { useEffect, useState } from 'react'
import type { CapacityWarningInfo } from '@ultranos/sync-engine'

export function SyncCapacityBanner() {
  const [warning, setWarning] = useState<CapacityWarningInfo | null>(null)
  const [queueFull, setQueueFull] = useState(false)

  useEffect(() => {
    const handleCapacityWarning = (e: Event) => {
      const detail = (e as CustomEvent<CapacityWarningInfo>).detail
      setWarning(detail)
    }

    const handleQueueFull = () => {
      setQueueFull(true)
    }

    window.addEventListener('ultranos:sync-capacity-warning', handleCapacityWarning)
    window.addEventListener('ultranos:sync-queue-full', handleQueueFull)

    return () => {
      window.removeEventListener('ultranos:sync-capacity-warning', handleCapacityWarning)
      window.removeEventListener('ultranos:sync-queue-full', handleQueueFull)
    }
  }, [])

  if (queueFull) {
    return (
      <div
        role="alert"
        className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
      >
        <strong>Sync queue full.</strong> Please connect to the internet to sync
        pending records before dispensing more.
      </div>
    )
  }

  if (warning) {
    return (
      <div
        role="status"
        className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
      >
        Sync queue nearly full ({warning.count} entries). Connect to sync.
        <button
          type="button"
          className="ms-2 font-medium underline"
          onClick={() => setWarning(null)}
        >
          Dismiss
        </button>
      </div>
    )
  }

  return null
}
