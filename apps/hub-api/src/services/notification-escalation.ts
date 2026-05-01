import type { SupabaseClient } from '@supabase/supabase-js'
import { AuditLogger } from '@ultranos/audit-logger'

/**
 * Notification Escalation Service.
 * Story 12.4 AC 8, 9: Escalation for unacknowledged critical results.
 *
 * Designed to run as a scheduled job (cron or Supabase function).
 *
 * Escalation policy:
 * - 24h unacknowledged: re-send notification to doctor (LAB_RESULT_ESCALATION)
 * - 48h unacknowledged: alert back-office team (create escalation record)
 *
 * "Critical" = any result with a LOINC code in the configurable critical set,
 * OR any notification of type LAB_RESULT_ESCALATION that was already escalated once.
 */

/**
 * Configurable set of LOINC codes considered "critical".
 * Default: codes that typically indicate urgent conditions.
 * These can be overridden via environment or database config.
 */
export const CRITICAL_LOINC_CODES = new Set([
  '4548-4',   // Hemoglobin A1c (diabetes monitoring — extremes are critical)
  '1558-6',   // Fasting glucose (hypoglycemia/hyperglycemia)
  '3016-3',   // TSH (thyroid — severe values)
])

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000

export interface EscalationResult {
  escalated24h: number
  escalated48h: number
  errors: number
}

/**
 * Check for unacknowledged notifications and escalate as needed.
 * Called by a scheduled job.
 */
export async function checkEscalations(
  supabase: SupabaseClient,
): Promise<EscalationResult> {
  const audit = new AuditLogger(supabase)
  const now = Date.now()
  const cutoff24h = new Date(now - TWENTY_FOUR_HOURS_MS).toISOString()

  const result: EscalationResult = {
    escalated24h: 0,
    escalated48h: 0,
    errors: 0,
  }

  // Find unacknowledged notifications older than 24h
  // that are lab result types (original or already-escalated)
  const { data: unacknowledged, error } = await supabase
    .from('notifications')
    .select('id, recipient_ref, recipient_role, type, payload, status, created_at, retry_count')
    .in('type', ['LAB_RESULT_AVAILABLE', 'LAB_RESULT_ESCALATION'])
    .in('status', ['QUEUED', 'SENT'])
    .lt('created_at', cutoff24h)
    .eq('recipient_role', 'CLINICIAN')

  if (error || !unacknowledged) {
    return { ...result, errors: 1 }
  }

  for (const notification of unacknowledged) {
    try {
      // Only escalate notifications for critical LOINC codes (AC: 8, 9)
      const payload = typeof notification.payload === 'string'
        ? (() => { try { return JSON.parse(notification.payload) } catch { return {} } })()
        : notification.payload ?? {}
      const loincCode = payload.loincCode as string | undefined
      if (loincCode && !CRITICAL_LOINC_CODES.has(loincCode)) {
        continue // Not a critical result — skip escalation
      }

      const createdAt = new Date(notification.created_at).getTime()
      const ageMs = now - createdAt
      const retryCount = notification.retry_count ?? 0

      if (ageMs >= FORTY_EIGHT_HOURS_MS && retryCount >= 1) {
        // 48h escalation: alert back-office team (AC: 9)
        const { data: escalationNotification } = await supabase.from('notifications').insert({
          recipient_ref: 'BACKOFFICE',
          recipient_role: 'CLINICIAN',
          type: 'LAB_RESULT_ESCALATION',
          payload: notification.payload,
          status: 'QUEUED',
          retry_count: 2, // Prevent re-escalation of this notification
        }).select('id').single()

        // Mark original as escalated
        await supabase
          .from('notifications')
          .update({ retry_count: retryCount + 1 })
          .eq('id', notification.id)

        await audit.emit({
          action: 'CREATE',
          resourceType: 'NOTIFICATION',
          resourceId: escalationNotification?.id ?? notification.id,
          actorId: 'SYSTEM',
          actorRole: 'SYSTEM',
          outcome: 'SUCCESS',
          metadata: {
            notificationAction: 'escalated_48h_backoffice',
            originalNotificationId: notification.id,
            recipientRef: notification.recipient_ref,
          },
        })

        result.escalated48h++
      } else if (retryCount === 0) {
        // 24h escalation: re-send to doctor (AC: 8)
        const { data: escalationNotification } = await supabase.from('notifications').insert({
          recipient_ref: notification.recipient_ref,
          recipient_role: notification.recipient_role,
          type: 'LAB_RESULT_ESCALATION',
          payload: notification.payload,
          status: 'QUEUED',
          retry_count: 1, // Prevent re-escalation of this notification
        }).select('id').single()

        // Mark original notification retry count
        await supabase
          .from('notifications')
          .update({ retry_count: retryCount + 1 })
          .eq('id', notification.id)

        await audit.emit({
          action: 'CREATE',
          resourceType: 'NOTIFICATION',
          resourceId: escalationNotification?.id ?? notification.id,
          actorId: 'SYSTEM',
          actorRole: 'SYSTEM',
          outcome: 'SUCCESS',
          metadata: {
            notificationAction: 'escalated_24h_resend',
            originalNotificationId: notification.id,
            recipientRef: notification.recipient_ref,
          },
        })

        result.escalated24h++
      }
    } catch {
      result.errors++
    }
  }

  return result
}
