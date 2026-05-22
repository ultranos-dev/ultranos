'use client'

import { useState, useEffect } from 'react'

/**
 * Small dot indicator showing current network connectivity.
 * Green dot + "Online" when connected, red dot + "Offline" when disconnected.
 */
export function OnlineStatusIndicator() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`}
        aria-hidden="true"
      />
      <span className="text-xs text-neutral-500">{online ? 'Online' : 'Offline'}</span>
    </div>
  )
}
