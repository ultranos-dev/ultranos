'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { isCollectionOnlyMode } from '@/lib/collection-mode'

interface CollectionModeGateProps {
  /** Content to render only in full mode (result entry, QC, inventory). */
  children: ReactNode
  /** Optional fallback rendered in collection-only mode. */
  fallback?: ReactNode
}

/**
 * Hides restricted UI sections when the current location is in
 * "Collection Only" mode. Restricted sections: result entry, QC, inventory.
 *
 * Renders children (full mode) until the mode check resolves, then
 * conditionally shows or hides based on the location's mode setting.
 */
export function CollectionModeGate({ children, fallback = null }: CollectionModeGateProps) {
  const [isCollectionOnly, setIsCollectionOnly] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    isCollectionOnlyMode()
      .then((result) => {
        if (!cancelled) setIsCollectionOnly(result)
      })
      .catch(() => {
        if (!cancelled) setIsCollectionOnly(false) // default to full mode on error
      })
    return () => {
      cancelled = true
    }
  }, [])

  // While checking, render children (optimistic — avoids flash of hidden content)
  if (isCollectionOnly === null) return <>{children}</>

  // Collection-only mode: show fallback instead of restricted content
  if (isCollectionOnly) return <>{fallback}</>

  return <>{children}</>
}
