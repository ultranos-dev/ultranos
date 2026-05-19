'use client'

import { useEffect, useState } from 'react'

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
            setShowUpdate(true)
          }
        })
      })
    })
  }, [])

  if (!showUpdate) return null

  return (
    <div className="fixed bottom-4 end-4 z-50 rounded-lg border border-primary-200 bg-white p-4 shadow-lg">
      <p className="text-sm font-medium text-neutral-900">A new version is available</p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => {
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              window.location.reload()
            })
            navigator.serviceWorker.ready.then((reg) => {
              reg.waiting?.postMessage({ type: 'SKIP_WAITING' })
            })
          }}
          className="rounded-md bg-primary-600 px-3 py-1 text-sm text-white hover:bg-primary-700"
        >
          Update
        </button>
        <button
          onClick={() => setShowUpdate(false)}
          className="rounded-md border border-neutral-300 px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-50"
        >
          Later
        </button>
      </div>
    </div>
  )
}
