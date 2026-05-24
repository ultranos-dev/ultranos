import { useState, useEffect } from 'react'
import { useAuthSessionStore } from '@/stores/auth-session-store'

const MAX_SESSION_MS = 12 * 60 * 60 * 1000
const WARNING_THRESHOLD_MS = 15 * 60 * 1000

export function useSessionExpiryWarning() {
  const session = useAuthSessionStore((s) => s.session)
  const [remainingMs, setRemainingMs] = useState<number | null>(null)

  const loginAtMs = session?.loginAt ? new Date(session.loginAt).getTime() : null

  useEffect(() => {
    if (!loginAtMs) return

    const update = () => {
      const elapsed = Date.now() - loginAtMs
      setRemainingMs(Math.max(0, MAX_SESSION_MS - elapsed))
    }
    update()
    const interval = setInterval(update, 30_000)
    return () => clearInterval(interval)
  }, [loginAtMs])

  const showWarning = remainingMs !== null && remainingMs <= WARNING_THRESHOLD_MS && remainingMs > 0
  const isExpired = remainingMs !== null && remainingMs <= 0

  return { remainingMs, showWarning, isExpired }
}
