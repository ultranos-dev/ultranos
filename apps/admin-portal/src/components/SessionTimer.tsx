'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getSupabaseBrowserClient } from '@/lib/supabase'

const SESSION_MAX_MS = 4 * 60 * 60 * 1000 // 4 hours
const WARNING_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes

export function SessionTimer() {
  const t = useTranslations('common')
  const [remainingMs, setRemainingMs] = useState<number | null>(null)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null

    async function init() {
      const supabase = getSupabaseBrowserClient()
      const { data } = await supabase.auth.getSession()
      const session = data?.session

      if (!session?.created_at) return

      // created_at may be a Unix timestamp (number) or ISO string
      const createdAtMs =
        typeof session.created_at === 'number'
          ? session.created_at * 1000
          : new Date(session.created_at).getTime()

      function computeRemaining() {
        const elapsed = Date.now() - createdAtMs
        return Math.max(0, SESSION_MAX_MS - elapsed)
      }

      const enforce = (remaining: number) => {
        setRemainingMs(remaining)
        // Story 62.2 (M-ADM-3): SessionTimer is now ENFORCING, not display-only.
        // When the 4h cap elapses, sign out immediately (belt-and-braces with the
        // AuthGuard watchdog). Tick every 15s near expiry so enforcement is prompt.
        if (remaining <= 0) {
          void supabase.auth.signOut().finally(() => {
            window.location.href = '/login'
          })
        }
      }

      enforce(computeRemaining())

      interval = setInterval(() => {
        enforce(computeRemaining())
      }, 15_000)
    }

    init()

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [])

  if (remainingMs === null) return null

  const hours = Math.floor(remainingMs / (60 * 60 * 1000))
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000))
  const isWarning = remainingMs < WARNING_THRESHOLD_MS

  return (
    <p
      className={`text-xs ${
        isWarning
          ? 'text-warning font-semibold'
          : 'text-primary-foreground/40'
      }`}
    >
      {t('sessionRemaining', { hours, minutes })}
    </p>
  )
}
