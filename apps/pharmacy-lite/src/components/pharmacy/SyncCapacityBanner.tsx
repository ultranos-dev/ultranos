'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

interface CapacityWarningInfo {
  count: number
}

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
        className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
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
        className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning"
      >
        Sync queue nearly full ({warning.count} entries). Connect to sync.
        <Button
          variant="ghost"
          type="button"
          onClick={() => setWarning(null)}
        >
          Dismiss
        </Button>
      </div>
    )
  }

  return null
}
