import { useEffect, useRef } from 'react'
import { quarantineExpiredBatches } from '@/lib/inventory/expiry-watchdog'
import { useAuthSessionStore } from '@/stores/auth-session-store'

const CHECK_INTERVAL_MS = 60 * 60 * 1000

export function useExpiryWatchdog() {
  const session = useAuthSessionStore((s) => s.session)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!session) return

    const performedBy = session.practitionerId ?? session.userId

    quarantineExpiredBatches(performedBy).catch(() => {})

    intervalRef.current = setInterval(() => {
      quarantineExpiredBatches(performedBy).catch(() => {})
    }, CHECK_INTERVAL_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [session])
}
