import { AuditLogger } from '@ultranos/audit-logger'
import type { SupabaseClient } from '@supabase/supabase-js'
import { db } from '@/lib/supabase'

/**
 * Daily license expiry check job — Story 22.4 Tasks 2 & 3.
 *
 * 1. Auto-suspends providers whose license has expired (AC #4).
 * 2. Sends approaching-expiry notifications at 60, 30, 7 day thresholds (AC #3).
 * 3. All actions are audit-logged (AC #11).
 *
 * This job is idempotent — safe to re-run. Notification deduplication is tracked
 * via `lastExpiryNotificationAt` and `lastExpiryNotificationThreshold` on the
 * practitioner record.
 */

const NOTIFICATION_THRESHOLDS = [60, 30, 7] as const

const NOTIFICATION_MESSAGES: Record<number, string> = {
  60: 'Your medical license expires in 60 days. Please prepare renewal documentation.',
  30: 'Your medical license expires in 30 days. Submit renewal documents to avoid service interruption.',
  7: 'URGENT: Your medical license expires in 7 days. Submit renewal immediately or your account will be suspended.',
}

const BATCH_SIZE = 50

interface JobResult {
  suspendedCount: number
  notificationsSent: number
  errors: number
  startedAt: string
  completedAt: string
}

export async function runLicenseExpiryCheck(supabase: SupabaseClient): Promise<JobResult> {
  const startedAt = new Date().toISOString()
  const audit = new AuditLogger(supabase)
  const today = new Date().toISOString().split('T')[0]

  let suspendedCount = 0
  let notificationsSent = 0
  let errors = 0

  // ─── Phase 1: Auto-suspend expired providers ───
  try {
    suspendedCount = await suspendExpiredProviders(supabase, audit, today)
  } catch (err) {
    errors++
    console.error('[LICENSE_EXPIRY_JOB] Suspension phase failed:', (err as Error).message)
  }

  // ─── Phase 2: Send approaching-expiry notifications ───
  try {
    notificationsSent = await sendExpiryNotifications(supabase, audit, today)
  } catch (err) {
    errors++
    console.error('[LICENSE_EXPIRY_JOB] Notification phase failed:', (err as Error).message)
  }

  const completedAt = new Date().toISOString()

  // Record job run
  try {
    await supabase.from('job_runs').insert(db.toRowRaw({
      jobName: 'license-expiry-check',
      startedAt,
      completedAt,
      status: errors > 0 ? 'completed_with_errors' : 'success',
      summary: { suspendedCount, notificationsSent, errors },
    }, 'non-PHI: job_runs'))
  } catch {
    console.warn('[LICENSE_EXPIRY_JOB] Failed to record job run')
  }

  console.info('[LICENSE_EXPIRY_JOB] Complete', { suspendedCount, notificationsSent, errors })

  return { suspendedCount, notificationsSent, errors, startedAt, completedAt }
}

async function suspendExpiredProviders(
  supabase: SupabaseClient,
  audit: AuditLogger,
  today: string,
): Promise<number> {
  // Phase 1: Collect all eligible IDs first to avoid pagination-while-mutating
  const eligibleIds: string[] = []
  let offset = 0

  while (true) {
    const { data: rows, error } = await supabase
      .from('practitioners')
      .select('id')
      .not('_ultranos->>licenseExpiry', 'is', null)
      .lte('_ultranos->>licenseExpiry', today)
      .eq('_ultranos->>kycStatus', 'ACTIVE')
      .range(offset, offset + BATCH_SIZE - 1)

    if (error || !rows || rows.length === 0) break
    for (const row of rows) eligibleIds.push(row.id)
    if (rows.length < BATCH_SIZE) break
    offset += BATCH_SIZE
  }

  // Phase 2: Process collected IDs
  let suspended = 0

  for (const id of eligibleIds) {
    try {
      // Fetch full record for update
      const { data: practitioner } = await supabase
        .from('practitioners')
        .select('id, _ultranos')
        .eq('id', id)
        .single()

      if (!practitioner) continue

      const currentUltranos = (practitioner as Record<string, unknown>)._ultranos as Record<string, unknown>

      // Recheck kycStatus to guard against concurrent changes (TOCTOU)
      if (currentUltranos.kycStatus !== 'ACTIVE') continue

      // Transition to SUSPENDED
      const { error: updateError } = await supabase
        .from('practitioners')
        .update(db.toRow({
          _ultranos: { ...currentUltranos, kycStatus: 'SUSPENDED', suspendedAt: today },
          meta: { lastUpdated: new Date().toISOString() },
        }))
        .eq('id', id)

      if (updateError) {
        console.error('[LICENSE_EXPIRY_JOB] Failed to suspend practitioner', { id })
        continue
      }

      // Audit — AC #11
      try {
        await audit.emit({
          action: 'LICENSE_EXPIRED_AUTO_SUSPENDED',
          resourceType: 'PRACTITIONER',
          resourceId: id,
          actorId: undefined,
          actorRole: 'SYSTEM',
          outcome: 'SUCCESS',
          metadata: { reason: 'License expired — auto-suspended by daily job' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'LICENSE_EXPIRED_AUTO_SUSPENDED', resourceId: id })
      }

      // Send notification to expired provider
      try {
        await supabase.from('notifications').insert(db.toRowRaw({
          recipientRef: id,
          type: 'LICENSE_EXPIRED',
          payload: JSON.stringify({
            message: 'Your license has expired. Clinical write access has been suspended.',
          }),
          status: 'QUEUED',
          createdAt: new Date().toISOString(),
        }, 'non-PHI: notifications'))
      } catch {
        console.warn('[LICENSE_EXPIRY_JOB] Failed to send suspension notification', { id })
      }

      suspended++
    } catch {
      console.error('[LICENSE_EXPIRY_JOB] Error processing practitioner', { id })
    }
  }

  return suspended
}

async function sendExpiryNotifications(
  supabase: SupabaseClient,
  audit: AuditLogger,
  today: string,
): Promise<number> {
  let sent = 0
  const processedIds = new Set<string>()

  for (const threshold of NOTIFICATION_THRESHOLDS) {
    const targetDate = new Date(today)
    targetDate.setDate(targetDate.getDate() + threshold)
    const targetDateStr = targetDate.toISOString().split('T')[0]

    let offset = 0
    while (true) {
      // Find providers whose license expires within this threshold
      // who haven't already been notified for this threshold
      const { data: rows, error } = await supabase
        .from('practitioners')
        .select('id, _ultranos')
        .not('_ultranos->>licenseExpiry', 'is', null)
        .lte('_ultranos->>licenseExpiry', targetDateStr)
        .gt('_ultranos->>licenseExpiry', today)
        .eq('_ultranos->>kycStatus', 'ACTIVE')
        .range(offset, offset + BATCH_SIZE - 1)

      if (error || !rows || rows.length === 0) break

      for (const row of rows) {
        // Skip if already processed in this run (prevents within-run duplicates across thresholds)
        if (processedIds.has(row.id)) continue

        const ultranos = (row as Record<string, unknown>)._ultranos as Record<string, unknown>
        const lastThreshold = ultranos.lastExpiryNotificationThreshold as number | null

        // Skip if already notified at this or more urgent (smaller number) threshold
        if (lastThreshold !== null && lastThreshold !== undefined && lastThreshold <= threshold) {
          continue
        }

        try {
          // Update notification tracking FIRST to prevent duplicate sends on retry
          const { error: updateError } = await supabase
            .from('practitioners')
            .update(db.toRow({
              _ultranos: {
                ...ultranos,
                lastExpiryNotificationAt: new Date().toISOString(),
                lastExpiryNotificationThreshold: threshold,
              },
            }))
            .eq('id', row.id)

          if (updateError) {
            console.warn('[LICENSE_EXPIRY_JOB] Failed to update notification tracking', { id: row.id })
            continue
          }

          // Queue notification only after tracking update succeeds
          await supabase.from('notifications').insert(db.toRowRaw({
            recipientRef: row.id,
            type: 'LICENSE_EXPIRY_WARNING',
            payload: JSON.stringify({
              message: NOTIFICATION_MESSAGES[threshold],
              daysRemaining: threshold,
            }),
            status: 'QUEUED',
            createdAt: new Date().toISOString(),
          }, 'non-PHI: notifications'))

          // Audit notification
          try {
            await audit.emit({
              action: 'LICENSE_EXPIRY_NOTIFICATION',
              resourceType: 'PRACTITIONER',
              resourceId: row.id,
              actorId: undefined,
              actorRole: 'SYSTEM',
              outcome: 'SUCCESS',
              metadata: { threshold, message: NOTIFICATION_MESSAGES[threshold] },
            })
          } catch {
            console.warn('[AUDIT_FAILURE]', { action: 'LICENSE_EXPIRY_NOTIFICATION', resourceId: row.id })
          }

          processedIds.add(row.id)
          sent++
        } catch {
          console.error('[LICENSE_EXPIRY_JOB] Failed to notify practitioner', { id: row.id, threshold })
        }
      }

      if (rows.length < BATCH_SIZE) break
      offset += BATCH_SIZE
    }
  }

  return sent
}
