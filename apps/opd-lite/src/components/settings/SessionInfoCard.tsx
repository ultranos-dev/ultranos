'use client'

import { useState, useEffect } from 'react'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { Card } from '@/components/Card'

function parseJwtPayload(token: string): { exp?: number; iat?: number } | null {
  try {
    const base64 = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}

function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return '0:00'
  const minutes = Math.floor(remainingMs / 60_000)
  const seconds = Math.floor((remainingMs % 60_000) / 1_000)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function countdownColor(remainingMs: number): string {
  if (remainingMs > 5 * 60_000) return 'text-success'
  if (remainingMs > 2 * 60_000) return 'text-yellow-600'
  return 'text-destructive'
}

export function SessionInfoCard() {
  const session = useAuthSessionStore((s) => s.session)
  const [remainingMs, setRemainingMs] = useState<number | null>(null)

  const token = (session as (typeof session) & { token?: string })?.token
  const payload = token ? parseJwtPayload(token) : null
  const expiresAtMs = payload?.exp ? payload.exp * 1000 : null
  const loginAtMs = payload?.iat ? payload.iat * 1000 : null

  useEffect(() => {
    if (!expiresAtMs) return

    const update = () => setRemainingMs(Math.max(0, expiresAtMs - Date.now()))
    update()
    const interval = setInterval(update, 1_000)
    return () => clearInterval(interval)
  }, [expiresAtMs])

  if (!session) return null

  const loginTime = loginAtMs ? new Date(loginAtMs).toLocaleTimeString() : 'Unknown'

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-foreground">Session Info</h2>

      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Login Time</p>
          <p className="text-sm text-foreground">{loginTime}</p>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground">Session Expiry</p>
          {remainingMs !== null ? (
            <p
              data-testid="session-countdown"
              className={`text-lg font-bold ${countdownColor(remainingMs)}`}
            >
              {formatCountdown(remainingMs)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Unavailable</p>
          )}
        </div>
      </div>
    </Card>
  )
}
