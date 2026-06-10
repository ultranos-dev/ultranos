'use client'

import { useEffect } from 'react'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'

const ENTITLEMENT_TIMEOUT_MS = 10_000

function getHubApiUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
  }
  return process.env.HUB_API_URL ?? 'http://localhost:3000/api/trpc'
}

/**
 * Checks the user's org entitlement for this module on mount and
 * whenever the session changes. Fails open on network error —
 * the API hard gate (Story 27.3) is the security boundary.
 */
export function useEntitlementCheck(moduleCode: string) {
  const session = useAuthSessionStore((s) => s.session)
  const setEntitlementStatus = useAuthSessionStore((s) => s.setEntitlementStatus)

  useEffect(() => {
    if (!session) return

    let cancelled = false
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
      if (!cancelled) {
        cancelled = true
        setEntitlementStatus('active')
      }
    }, ENTITLEMENT_TIMEOUT_MS)

    setEntitlementStatus('checking')

    async function check() {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data: authData } = await supabase.auth.getSession()
        const token = authData.session?.access_token

        if (cancelled) return

        if (!token) {
          setEntitlementStatus('active')
          return
        }

        let baseUrl: string
        try {
          baseUrl = new URL(getHubApiUrl()).toString()
        } catch {
          setEntitlementStatus('active')
          return
        }

        const url = new URL(baseUrl)
        url.pathname = url.pathname.replace(/\/$/, '') + '/entitlement.check'
        url.searchParams.set('input', JSON.stringify({ json: { moduleCode } }))

        const res = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        })

        if (cancelled) return

        if (!res.ok) {
          setEntitlementStatus('active')
          return
        }

        const body = await res.json()
        const status = body?.result?.data?.json?.status
        if (!cancelled && (status === 'active' || status === 'trial' || status === 'inactive')) {
          setEntitlementStatus(status)
        } else if (!cancelled) {
          setEntitlementStatus('active')
        }
      } catch {
        if (!cancelled) {
          setEntitlementStatus('active')
        }
      }
    }

    check()

    return () => {
      cancelled = true
      clearTimeout(timeout)
      controller.abort()
    }
  }, [session, moduleCode, setEntitlementStatus])
}
