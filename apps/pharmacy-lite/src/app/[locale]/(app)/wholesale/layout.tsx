'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/db'

/**
 * Wholesale route guard — spec §7.
 * When `enableWholesale` is false (or not yet loaded), children are NOT rendered.
 * If the flag is off, the user is redirected to `/`.
 */
export default function WholesaleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null) // null = loading

  useEffect(() => {
    async function checkSetting() {
      try {
        const settings = await db.pharmacySettings.toCollection().first()
        if (settings?.enableWholesale === true) {
          setAllowed(true)
        } else {
          setAllowed(false)
          router.replace('/')
        }
      } catch {
        // On error, deny access and redirect
        setAllowed(false)
        router.replace('/')
      }
    }
    checkSetting()
  }, [router])

  // While loading or redirecting, render nothing — do NOT flash children
  if (allowed !== true) return null

  return <>{children}</>
}
