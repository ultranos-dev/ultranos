import { AuditLogger } from '@ultranos/audit-logger'
import type { SupabaseClient } from '@supabase/supabase-js'
import { db } from '@/lib/supabase'
import { emitClinicalSafetyAlert } from '@/lib/alert-notifier'

/**
 * Daily audit chain integrity verification job — Story 23.3 Tasks 1 & 3.
 *
 * Reuses AuditLogger.verifyChain() (same as health.auditChainIntegrity).
 * Stores results in audit_chain_verifications table.
 * Emits P1 alert on chain break, P2 on job failure.
 * All outcomes are audit-logged with SYSTEM actor (AC #10).
 */

const DEFAULT_LIMIT = 10_000

export interface AuditChainVerifyResult {
  valid: boolean | null
  checkedCount: number
  brokenAtEventId?: string
  jobDurationMs: number
  isFullVerification: boolean
  errorReason?: string
}

export async function runAuditChainVerify(
  supabase: SupabaseClient,
  options: { limit?: number; triggeredBy?: string; isFullVerification?: boolean } = {},
): Promise<AuditChainVerifyResult> {
  const {
    limit = DEFAULT_LIMIT,
    triggeredBy = 'CRON',
    isFullVerification = false,
  } = options

  const startedAt = Date.now()
  const audit = new AuditLogger(supabase)

  try {
    const result = await audit.verifyChain(limit)
    const jobDurationMs = Date.now() - startedAt

    // Store verification result (AC #6) — best-effort on success path.
    // A store failure must NOT convert a valid chain result into a false P2 alert.
    try {
      await storeVerificationResult(supabase, {
        checkedCount: result.checkedCount,
        valid: result.valid,
        brokenAtEventId: result.brokenAt,
        jobDurationMs,
        isFullVerification,
        triggeredBy,
      })
    } catch (storeErr) {
      console.error('[AUDIT_CHAIN_VERIFY] Failed to persist verification result:', (storeErr as Error).message)
    }

    // Log structured summary — no PHI (AC #4)
    console.info('[AUDIT_CHAIN_VERIFY]', {
      job: 'audit-chain-verify',
      checkedCount: result.checkedCount,
      valid: result.valid,
      durationMs: jobDurationMs,
      triggeredBy,
      isFullVerification,
    })

    if (result.valid) {
      // AC #10: Audit-log success with SYSTEM actor
      try {
        await audit.emit({
          action: 'AUDIT_CHAIN_VERIFIED',
          resourceType: 'AUDIT_CHAIN',
          actorId: 'SYSTEM',
          actorRole: 'SYSTEM',
          outcome: 'SUCCESS',
          metadata: { checkedCount: result.checkedCount, durationMs: jobDurationMs },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'AUDIT_CHAIN_VERIFIED' })
      }
    } else if (result.brokenAt === 'query_failed') {
      // DB error — not a real chain break. Route to P2 (job failure), not P1.
      try {
        await emitClinicalSafetyAlert(supabase, {
          type: 'AUDIT_CHAIN_VERIFY_FAILED',
          severity: 'P2',
          title: 'Audit Chain Verification Job Failed',
          payload: {
            error: 'Database query failed during chain verification',
            description: 'The audit chain verification could not complete due to a database error.',
          },
        })
      } catch {
        console.error('[AUDIT_CHAIN_VERIFY] Failed to emit P2 alert for query failure')
      }
    } else {
      // AC #3: P1 alert on genuine chain break
      // Emit alert notification first, then audit-log — so notification is sent
      // even if audit_log is unavailable (which may be WHY the chain broke).
      try {
        await emitClinicalSafetyAlert(supabase, {
          type: 'AUDIT_CHAIN_BROKEN',
          severity: 'P1',
          title: 'Audit Chain Integrity Broken',
          payload: {
            brokenAtEventId: result.brokenAt,
            checkedCount: result.checkedCount,
            description: 'The audit log hash chain has been broken. This may indicate tampering.',
          },
        })
      } catch (alertErr) {
        // P1 alert notification must not be silently swallowed.
        // Log at error level so external log monitoring can catch it.
        console.error('[AUDIT_CHAIN_VERIFY] CRITICAL: Failed to emit P1 chain-break alert:', (alertErr as Error).message)
      }

      // AC #10: Audit-log chain break with SYSTEM actor (best-effort after alert)
      try {
        await audit.emit({
          action: 'AUDIT_CHAIN_BROKEN',
          resourceType: 'AUDIT_CHAIN',
          resourceId: result.brokenAt,
          actorId: 'SYSTEM',
          actorRole: 'SYSTEM',
          outcome: 'FAILURE',
          metadata: { checkedCount: result.checkedCount, brokenAtEventId: result.brokenAt },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'AUDIT_CHAIN_BROKEN' })
      }
    }

    return {
      valid: result.valid,
      checkedCount: result.checkedCount,
      brokenAtEventId: result.brokenAt,
      jobDurationMs,
      isFullVerification,
    }
  } catch (err) {
    const jobDurationMs = Date.now() - startedAt
    const errorReason = (err as Error).message?.slice(0, 500) || 'Unknown error'

    // Store failure in verifications table with valid: null (AC #7)
    try {
      await storeVerificationResult(supabase, {
        checkedCount: 0,
        valid: null,
        jobDurationMs,
        isFullVerification,
        triggeredBy,
        errorReason,
      })
    } catch {
      console.error('[AUDIT_CHAIN_VERIFY] Failed to store failure result')
    }

    // AC #7: P2 alert on job failure
    try {
      await emitClinicalSafetyAlert(supabase, {
        type: 'AUDIT_CHAIN_VERIFY_FAILED',
        severity: 'P2',
        title: 'Audit Chain Verification Job Failed',
        payload: {
          error: errorReason,
          description: 'The audit chain verification job failed. Monitoring gap — needs attention.',
        },
      })
    } catch {
      console.error('[AUDIT_CHAIN_VERIFY] Failed to emit P2 alert')
    }

    console.error('[AUDIT_CHAIN_VERIFY] Job failed:', errorReason)

    return {
      valid: null,
      checkedCount: 0,
      jobDurationMs,
      isFullVerification,
      errorReason,
    }
  }
}

async function storeVerificationResult(
  supabase: SupabaseClient,
  result: {
    checkedCount: number
    valid: boolean | null
    brokenAtEventId?: string
    jobDurationMs: number
    isFullVerification: boolean
    triggeredBy: string
    errorReason?: string
  },
): Promise<void> {
  const { error } = await supabase.from('audit_chain_verifications').insert(
    db.toRowRaw(
      {
        verifiedAt: new Date().toISOString(),
        checkedCount: result.checkedCount,
        valid: result.valid,
        brokenAtEventId: result.brokenAtEventId ?? null,
        jobDurationMs: result.jobDurationMs,
        isFullVerification: result.isFullVerification,
        triggeredBy: result.triggeredBy,
        errorReason: result.errorReason ?? null,
      },
      'non-PHI: audit_chain_verifications',
    ),
  )

  if (error) {
    console.error('[AUDIT_CHAIN_VERIFY] Failed to store verification result:', error.message)
    throw error
  }
}
