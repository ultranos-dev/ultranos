'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

export function SwUpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.ready.then((registration) => {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New SW waiting — prompt user
            setShowUpdate(true)
          }
        })
      })
    })
  }, [])

  if (!showUpdate) return null

  return (
    <div className="fixed bottom-4 end-4 z-50 rounded-lg border border-primary-200 bg-background p-4 shadow-lg">
      <p className="text-sm font-medium text-foreground">A new version is available</p>
      <div className="mt-2 flex gap-2">
        <Button
          variant="default"
          onClick={() => {
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              window.location.reload()
            })
            navigator.serviceWorker.ready.then((reg) => {
              reg.waiting?.postMessage({ type: 'SKIP_WAITING' })
            })
          }}
        >
          Update
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowUpdate(false)}
        >
          Later
        </Button>
      </div>
    </div>
  )
}
