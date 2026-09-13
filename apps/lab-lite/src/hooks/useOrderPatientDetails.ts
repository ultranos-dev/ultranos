'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { fetchOrderPatientDetails, type LabOrderPatientDetails } from '@/lib/trpc'

/**
 * Fetch the detail-view PHI (full name + blood group + latest vitals) for the
 * patient behind an order, on demand. Order-scoped at the Hub. Offline-safe:
 * `details` stays null on any failure. Used by the Patient Details modal and the
 * verification step (CLAUDE.md Rule #7 detail-view scope).
 */
export function useOrderPatientDetails(orderId: string | undefined): {
  details: LabOrderPatientDetails | null
  loading: boolean
} {
  const [details, setDetails] = useState<LabOrderPatientDetails | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orderId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const { data } = await getSupabaseBrowserClient().auth.getSession()
        const token = data.session?.access_token
        const d = token ? await fetchOrderPatientDetails(orderId, token) : null
        if (!cancelled) setDetails(d)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orderId])

  return { details, loading }
}
