import { NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { AuditLogger } from '@ultranos/audit-logger'

/**
 * Patient subscription webhook — receives store notifications.
 * Story 27.12, Task 7.
 *
 * Handles:
 * - Google Play Real-time Developer Notifications (RTDN) via Pub/Sub
 * - Apple App Store Server Notifications V2
 *
 * These are REST POST endpoints (not tRPC) — store servers send raw HTTP.
 * Signature verification: Google uses Pub/Sub message verification,
 * Apple uses JWS signed notifications.
 *
 * POST /api/patient-subscription/webhook?platform=android|ios
 */

interface SubscriptionEvent {
  patientId: string
  eventType: 'SUBSCRIPTION_EXPIRED' | 'SUBSCRIPTION_RENEWED' | 'SUBSCRIPTION_CANCELLED' | 'SUBSCRIPTION_REFUNDED'
  notificationId: string
  platform: 'android' | 'ios'
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const platform = url.searchParams.get('platform') as 'android' | 'ios' | null

  if (!platform || !['android', 'ios'].includes(platform)) {
    return NextResponse.json(
      { error: 'Missing or invalid platform query parameter' },
      { status: 400 },
    )
  }

  const supabase = getSupabaseClient()
  let event: SubscriptionEvent | null = null

  try {
    if (platform === 'android') {
      event = await parseGoogleNotification(request)
    } else {
      event = await parseAppleNotification(request)
    }
  } catch {
    return NextResponse.json(
      { error: 'Failed to parse notification' },
      { status: 400 },
    )
  }

  if (!event) {
    // Unrecognized event type — acknowledge to prevent redelivery
    return NextResponse.json({ received: true })
  }

  // Idempotency guard — check if we've already processed this notification
  const { data: existing } = await supabase
    .from('patient_subscription_events')
    .select('id')
    .eq('notification_id', event.notificationId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ received: true })
  }

  // Record the event for idempotency tracking
  await supabase
    .from('patient_subscription_events')
    .insert({
      notification_id: event.notificationId,
      patient_id: event.patientId,
      event_type: event.eventType,
      platform: event.platform,
      processed_at: new Date().toISOString(),
    })
    .catch(() => {
      // Insert failure for idempotency record is non-fatal
      // Duplicate processing is safe due to idempotent tier updates
    })

  // Determine new tier based on event type
  let newTier: 'FREE' | 'PREMIUM'
  switch (event.eventType) {
    case 'SUBSCRIPTION_EXPIRED':
    case 'SUBSCRIPTION_CANCELLED':
    case 'SUBSCRIPTION_REFUNDED':
      newTier = 'FREE'
      break
    case 'SUBSCRIPTION_RENEWED':
      newTier = 'PREMIUM'
      break
    default:
      return NextResponse.json({ received: true })
  }

  // Fetch current tier for audit trail
  const { data: patient } = await supabase
    .from('patients')
    .select('id, patient_tier')
    .eq('id', event.patientId)
    .eq('is_active', true)
    .single()

  if (!patient) {
    // Patient not found — acknowledge to prevent redelivery
    console.warn('[PATIENT_SUB_WEBHOOK] Patient not found for subscription event')
    return NextResponse.json({ received: true })
  }

  const previousTier = (patient.patient_tier as string) ?? 'FREE'

  // Skip if tier is already correct (idempotent)
  if (previousTier === newTier) {
    return NextResponse.json({ received: true })
  }

  // Update patient tier
  const { error: updateError } = await supabase
    .from('patients')
    .update({
      patient_tier: newTier,
      updated_at: new Date().toISOString(),
    })
    .eq('id', event.patientId)
    .eq('is_active', true)

  if (updateError) {
    console.error('[PATIENT_SUB_WEBHOOK] Tier update failed:', { code: updateError.code })
    return NextResponse.json(
      { error: 'Failed to update tier' },
      { status: 500 },
    )
  }

  // Audit event — opaque patient ID only, no PHI
  const audit = new AuditLogger(supabase)
  try {
    await audit.emit({
      action: 'UPDATE',
      resourceType: 'PATIENT',
      resourceId: event.patientId,
      actorId: 'SYSTEM',
      actorRole: 'SYSTEM',
      outcome: 'SUCCESS',
      sessionId: 'webhook',
      metadata: {
        operation: 'tier_change',
        previousTier,
        newTier,
        platform: event.platform,
        trigger: 'store_webhook',
        eventType: event.eventType,
      },
    })
  } catch {
    console.warn('[AUDIT_FAILURE]', {
      action: 'UPDATE',
      resourceType: 'PATIENT',
      resourceId: event.patientId,
    })
  }

  return NextResponse.json({ received: true })
}

/**
 * Parse Google Play Real-time Developer Notification.
 * Google sends a Pub/Sub message with base64-encoded data containing
 * the subscription notification type and purchase token.
 */
async function parseGoogleNotification(
  request: Request,
): Promise<SubscriptionEvent | null> {
  const body = await request.json()

  // Google Pub/Sub wraps the notification in a message.data field (base64)
  const messageData = body?.message?.data
  if (!messageData) return null

  const decoded = JSON.parse(
    Buffer.from(messageData, 'base64').toString('utf-8'),
  )

  const subNotification = decoded?.subscriptionNotification
  if (!subNotification) return null

  // Map Google notification types to our event types
  // See: https://developer.android.com/google/play/billing/rtdn-reference
  const typeMap: Record<number, SubscriptionEvent['eventType']> = {
    // SUBSCRIPTION_EXPIRED
    13: 'SUBSCRIPTION_EXPIRED',
    // SUBSCRIPTION_CANCELED
    3: 'SUBSCRIPTION_CANCELLED',
    // SUBSCRIPTION_RENEWED
    2: 'SUBSCRIPTION_RENEWED',
    // SUBSCRIPTION_REVOKED
    12: 'SUBSCRIPTION_REFUNDED',
  }

  const eventType = typeMap[subNotification.notificationType]
  if (!eventType) return null

  // The purchaseToken links to the patient — resolve via stored mapping.
  // In production, look up patient_id from a purchase_tokens table.
  // decoded.patientId is an Ultranos extension for dev/testing payloads.
  const patientId = decoded.patientId
  if (!patientId) return null // Cannot resolve patient — reject rather than use purchaseToken as UUID

  const messageId = body?.message?.messageId
  if (!messageId) return null // Reject payloads without a notification ID — required for idempotency

  return {
    patientId,
    eventType,
    notificationId: messageId,
    platform: 'android',
  }
}

/**
 * Parse Apple App Store Server Notification V2.
 * Apple sends a JWS-signed notification with transaction info.
 */
async function parseAppleNotification(
  request: Request,
): Promise<SubscriptionEvent | null> {
  const body = await request.json()

  // Apple sends signedPayload — in production, verify JWS signature
  const signedPayload = body?.signedPayload
  if (!signedPayload) return null

  // Decode JWS payload (second part, base64url-encoded)
  const parts = signedPayload.split('.')
  if (parts.length < 2) return null

  const payloadStr = Buffer.from(
    parts[1].replace(/-/g, '+').replace(/_/g, '/'),
    'base64',
  ).toString('utf-8')
  const payload = JSON.parse(payloadStr)

  // Map Apple notification types
  // DID_FAIL_TO_RENEW is omitted — it fires during the billing grace period
  // (up to 16 days) when the subscription is still active. Per AC7, premium
  // features must remain accessible during grace period.
  const typeMap: Record<string, SubscriptionEvent['eventType']> = {
    EXPIRED: 'SUBSCRIPTION_EXPIRED',
    DID_RENEW: 'SUBSCRIPTION_RENEWED',
    REFUND: 'SUBSCRIPTION_REFUNDED',
    REVOKE: 'SUBSCRIPTION_CANCELLED',
  }

  const notificationType = payload?.notificationType
  const eventType = typeMap[notificationType]
  if (!eventType) return null

  // Extract patient ID from the transaction's appAccountToken
  const transactionInfo = payload?.data?.signedTransactionInfo
  let patientId = ''
  if (transactionInfo) {
    const txParts = transactionInfo.split('.')
    if (txParts.length >= 2) {
      const txPayload = JSON.parse(
        Buffer.from(
          txParts[1].replace(/-/g, '+').replace(/_/g, '/'),
          'base64',
        ).toString('utf-8'),
      )
      patientId = txPayload.appAccountToken ?? ''
    }
  }

  if (!patientId) {
    patientId = payload?.data?.appAccountToken ?? ''
  }

  if (!patientId) return null

  const notificationUUID = payload?.notificationUUID
  if (!notificationUUID) return null // Reject payloads without a notification ID — required for idempotency

  return {
    patientId,
    eventType,
    notificationId: notificationUUID,
    platform: 'ios',
  }
}
