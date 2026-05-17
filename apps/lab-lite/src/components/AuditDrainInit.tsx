'use client'

import { useEffect } from 'react'
import { startAuditDrain, stopAuditDrain } from '@/lib/audit-client'

/**
 * Starts the AuditDrainWorker when mounted (inside AuthGuard, so only after login).
 * Stops the worker on unmount (logout/session expiry).
 */
export function AuditDrainInit() {
  useEffect(() => {
    startAuditDrain()
    return () => {
      stopAuditDrain()
    }
  }, [])

  return null
}
