import { getSupabaseClient } from '@/lib/supabase'
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock'
import { runLicenseExpiryCheck } from './license-expiry-check'
import { runAnomalyDetection } from './anomaly-detection'
import { runAuditChainVerify } from './audit-chain-verify'

// Lock TTL: generous margin over expected job duration (jobs typically take 2-3 minutes)
const LICENSE_EXPIRY_LOCK_TTL = 600 // 10 minutes
const ANOMALY_DETECTION_LOCK_TTL = 600 // 10 minutes
const AUDIT_CHAIN_VERIFY_LOCK_TTL = 600 // 10 minutes

/**
 * Cron job runner — Story 22.4 Task 6, extended by Story 22.6, 23.0.
 *
 * Scheduled to run daily at 00:00 UTC.
 * License expiry runs first; anomaly detection runs after (staggered).
 *
 * Can be invoked via:
 *   - Node.js cron scheduler (node-cron)
 *   - Supabase Edge Function cron trigger
 *   - External scheduler (GitHub Actions, etc.)
 *
 * Idempotent: safe to re-run on the same day.
 * Uses distributed locks (Story 23.0) to prevent duplicate concurrent runs.
 */
export async function runDailyJobs(): Promise<void> {
  const supabase = getSupabaseClient()

  // Phase 1: License expiry check (00:00 UTC)
  const licenseToken = await acquireCronLock('license-expiry', LICENSE_EXPIRY_LOCK_TTL)
  if (!licenseToken) {
    console.info('[CRON] License expiry check skipped — another instance holds the lock')
  } else {
    console.info('[CRON] Starting daily license expiry check')
    try {
      const result = await runLicenseExpiryCheck(supabase)
      console.info('[CRON] License expiry check complete', {
        suspended: result.suspendedCount,
        notifications: result.notificationsSent,
        errors: result.errors,
        duration: `${new Date(result.completedAt).getTime() - new Date(result.startedAt).getTime()}ms`,
      })
    } catch (err) {
      console.error('[CRON] License expiry check failed:', (err as Error).message)
    } finally {
      await releaseCronLock('license-expiry', licenseToken)
    }
  }

  // Phase 2: Anomaly detection (02:00 UTC when run independently)
  const anomalyToken = await acquireCronLock('anomaly-detection', ANOMALY_DETECTION_LOCK_TTL)
  if (!anomalyToken) {
    console.info('[CRON] Anomaly detection skipped — another instance holds the lock')
  } else {
    console.info('[CRON] Starting daily anomaly detection')
    try {
      const result = await runAnomalyDetection(supabase)
      console.info('[CRON] Anomaly detection complete', {
        alertsGenerated: result.alertsGenerated,
        errors: result.errors,
        duration: `${new Date(result.completedAt).getTime() - new Date(result.startedAt).getTime()}ms`,
      })
    } catch (err) {
      console.error('[CRON] Anomaly detection failed:', (err as Error).message)
    } finally {
      await releaseCronLock('anomaly-detection', anomalyToken)
    }
  }

  // Phase 3: Audit chain integrity verification (03:00 UTC when run independently)
  const auditChainToken = await acquireCronLock('audit-chain-verify', AUDIT_CHAIN_VERIFY_LOCK_TTL)
  if (!auditChainToken) {
    console.info('[CRON] Audit chain verification skipped — another instance holds the lock')
  } else {
    console.info('[CRON] Starting daily audit chain verification')
    try {
      const result = await runAuditChainVerify(supabase)
      console.info('[CRON] Audit chain verification complete', {
        valid: result.valid,
        checkedCount: result.checkedCount,
        duration: `${result.jobDurationMs}ms`,
      })
    } catch (err) {
      console.error('[CRON] Audit chain verification failed:', (err as Error).message)
    } finally {
      await releaseCronLock('audit-chain-verify', auditChainToken)
    }
  }
}

// Allow direct invocation: `npx tsx src/jobs/cron-runner.ts`
if (typeof require !== 'undefined' && require.main === module) {
  runDailyJobs()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}
