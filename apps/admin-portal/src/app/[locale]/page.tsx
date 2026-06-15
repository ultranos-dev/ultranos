'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'

/**
 * Admin Portal Landing Page
 *
 * The "front door" for the entire platform's admin experience.
 * - Unauthenticated visitors see a value prop + Register/Sign In CTAs
 * - Authenticated admins are redirected to /dashboard immediately
 */
export default function LandingPage() {
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    async function checkExistingSession() {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          window.location.href = '/dashboard'
          return
        }
      } catch {
        // No session — show landing page
      }
      setChecking(false)
    }
    checkExistingSession()
  }, [])

  if (checking) return null

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg text-center">
        {/* Brand */}
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          Ultranos
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Healthcare Administration Portal
        </p>

        {/* Value prop */}
        <p className="mx-auto mt-6 max-w-md text-sm text-muted-foreground">
          Manage your clinic&apos;s subscriptions, provision staff accounts, verify credentials, and monitor operations — all from one place.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href="/register"
            className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-foreground hover:scale-[1.02] transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2"
          >
            Register Your Organization
          </a>
          <a
            href="/login"
            className="inline-flex items-center justify-center rounded-full border border-border bg-popover px-6 py-3 text-sm font-medium text-foreground hover:bg-card hover:scale-[1.02] transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2"
          >
            Sign In
          </a>
        </div>

        {/* Feature highlights */}
        <div className="mt-12 grid grid-cols-1 gap-4 text-start sm:grid-cols-3">
          <div className="rounded-2xl bg-popover p-5">
            <p className="text-sm font-medium text-foreground">Multi-Module Platform</p>
            <p className="mt-1 text-xs text-muted-foreground">
              OPD, Pharmacy, and Lab modules — subscribe to what you need.
            </p>
          </div>
          <div className="rounded-2xl bg-popover p-5">
            <p className="text-sm font-medium text-foreground">Offline-First</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Clinical workflows work without connectivity. Data syncs when online.
            </p>
          </div>
          <div className="rounded-2xl bg-popover p-5">
            <p className="text-sm font-medium text-foreground">30-Day Free Trial</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No payment required. Full access to all selected modules.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
