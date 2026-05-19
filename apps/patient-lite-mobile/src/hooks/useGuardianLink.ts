/**
 * useGuardianLink — hook for managing guardian link state.
 *
 * Story 18.7, Task 3: Guardian link state for Privacy Settings.
 *
 * Loads the active guardian link from local SQLCipher and provides
 * unlink functionality with confirmation.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import type { GuardianLink } from '@ultranos/shared-types'
import { getActiveGuardianLink, unlinkGuardian } from '@/data/guardian-api'
import { emitAuditEvent } from '@/lib/audit'

export interface UseGuardianLinkResult {
  guardianLink: GuardianLink | null
  isLoading: boolean
  error: string | null
  unlinkCurrentGuardian: () => Promise<void>
  refresh: () => Promise<void>
}

export function useGuardianLink(patientId: string | undefined): UseGuardianLinkResult {
  const [guardianLink, setGuardianLink] = useState<GuardianLink | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const opSeq = useRef(0)

  const load = useCallback(async () => {
    if (!patientId) {
      setGuardianLink(null)
      setIsLoading(false)
      return
    }

    const seq = ++opSeq.current
    try {
      setIsLoading(true)
      setError(null)
      const link = await getActiveGuardianLink(patientId)
      if (seq !== opSeq.current) return
      setGuardianLink(link)
    } catch {
      if (seq !== opSeq.current) return
      setError('Failed to load guardian link')
    } finally {
      if (seq === opSeq.current) setIsLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    void load()
  }, [load])

  const unlinkCurrentGuardian = useCallback(async () => {
    if (!patientId || !guardianLink) return

    try {
      await unlinkGuardian(patientId, guardianLink.id)
      // Audit is handled inside unlinkGuardian — no duplicate event here
      setGuardianLink(null)
    } catch {
      // Audit failed unlink attempt (CLAUDE.md Rule #6)
      emitAuditEvent({
        action: 'GUARDIAN_LINK_REVOKED',
        resourceType: 'GuardianLink',
        resourceId: guardianLink.id,
        patientId,
        outcome: 'failure',
        metadata: { event: 'guardian_unlink_failed' },
      })
      setError('Failed to unlink guardian')
    }
  }, [patientId, guardianLink])

  return {
    guardianLink,
    isLoading,
    error,
    unlinkCurrentGuardian,
    refresh: load,
  }
}
