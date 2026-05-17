import type { SupabaseClient } from '@supabase/supabase-js'
import { AuditLogger } from '@ultranos/audit-logger'

/**
 * Alert Notifier — Story 23.1 Task 7 + Story 23.2.
 *
 * Provides two interfaces:
 * 1. sendAlert() — infrastructure/metrics alerts with webhook + audit delivery
 * 2. emitClinicalSafetyAlert() — clinical safety alerts with audit + notification queue
 *
 * All alerts are audit-logged with SYSTEM actor (no PHI in payloads).
 */

export type AlertSeverity = 'P1' | 'P2' | 'P3'

/**
 * Infrastructure alert payload — Story 23.1.
 * Used by metrics alerting (P95 latency, error rate, sync queue depth).
 */
export interface AlertPayload {
  severity: 'P1' | 'P2'
  title: string
  description: string
  metric: string
  currentValue: number
  threshold: number
  timestamp: string
}

/**
 * Send an infrastructure/metrics alert via configured channels.
 * - ALERT_WEBHOOK_URL: POST JSON to webhook (Slack, PagerDuty, generic)
 * - Always logs to audit system with SYSTEM actor (no PHI in payloads)
 *
 * Never throws — alert delivery failures are logged but don't crash the caller.
 */
export async function sendAlert(payload: AlertPayload): Promise<void> {
  // Webhook delivery
  const webhookUrl = process.env.ALERT_WEBHOOK_URL
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (err) {
      console.warn('[ALERT] Webhook delivery failed:', (err as Error).message)
    }
  }

  // Audit log — always, regardless of webhook config
  // Uses AuditLogger to preserve SHA-256 hash chain integrity
  try {
    const { getSupabaseClient } = await import('@/lib/supabase')
    const supabase = getSupabaseClient()
    const audit = new AuditLogger(supabase)
    await audit.emit({
      action: 'ALERT',
      resourceType: 'Metric',
      resourceId: payload.metric,
      actorId: 'SYSTEM',
      actorRole: 'SYSTEM',
      outcome: 'SUCCESS',
      metadata: {
        severity: payload.severity,
        title: payload.title,
        description: payload.description,
        currentValue: payload.currentValue,
        threshold: payload.threshold,
      },
    })
  } catch (err) {
    console.warn('[ALERT] Audit log failed:', (err as Error).message)
  }
}

export interface ClinicalSafetyAlert {
  type: string
  severity: AlertSeverity
  title: string
  payload: Record<string, unknown>
}

/**
 * Emit a clinical safety alert: audit-log it and queue a notification
 * for the Clinical Safety Officer role.
 */
export async function emitClinicalSafetyAlert(
  supabase: SupabaseClient,
  alert: ClinicalSafetyAlert,
): Promise<void> {
  // AC #8: All clinical safety alerts are audit-logged with SYSTEM actor
  const audit = new AuditLogger(supabase)
  try {
    await audit.emit({
      action: 'CLINICAL_SAFETY_ALERT',
      resourceType: 'CLINICAL_SAFETY',
      resourceId: alert.type,
      actorId: 'SYSTEM',
      actorRole: 'SYSTEM',
      outcome: 'SUCCESS',
      metadata: {
        alertType: alert.type,
        severity: alert.severity,
        title: alert.title,
        ...alert.payload,
      },
    })
  } catch (err) {
    console.error('[CLINICAL_SAFETY_ALERT] Audit log failed:', (err as Error).message)
    // Audit failure for clinical safety alerts is critical — rethrow
    throw err
  }

  // Queue notification for Clinical Safety Officer role
  try {
    await supabase.from('notifications').insert({
      recipient_ref: 'ROLE:CLINICAL_SAFETY_OFFICER',
      recipient_role: 'ADMIN',
      type: alert.type,
      payload: JSON.stringify({
        severity: alert.severity,
        title: alert.title,
        ...alert.payload,
      }),
      status: 'QUEUED',
      next_retry_at: new Date(Date.now() + 60_000).toISOString(),
    })
  } catch {
    console.warn('[CLINICAL_SAFETY_ALERT] Notification queue failed:', { type: alert.type })
  }
}
