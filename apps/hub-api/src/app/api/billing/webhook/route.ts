import { NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { AuditLogger } from '@ultranos/audit-logger'
import { getBillingAdapter, BillingEventType } from '@ultranos/billing'
import { sendBillingNotification } from '@/services/billing-notifications'

/**
 * Raw HTTP webhook endpoint for payment providers — Story 27.8 (F2).
 *
 * This route bypasses tRPC to preserve the raw request body, which is
 * required for Stripe's HMAC signature verification via constructEvent().
 * tRPC's body parsing alters the byte representation, breaking HMAC.
 *
 * Production Stripe webhook URL: POST /api/billing/webhook
 */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature') ?? ''

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 },
    )
  }

  const adapter = getBillingAdapter()
  const supabase = getSupabaseClient()

  // Verify webhook signature using raw body
  let webhookEvent
  try {
    webhookEvent = await adapter.handleWebhook(rawBody, signature)
  } catch (err) {
    const isSignatureError =
      err instanceof Error &&
      (err.message.includes('signature') || err.message.includes('Webhook'))
    return NextResponse.json(
      { error: isSignatureError ? 'Signature verification failed' : 'Processing error' },
      { status: isSignatureError ? 401 : 500 },
    )
  }

  // Unmapped event — acknowledge but skip
  if (!webhookEvent) {
    return NextResponse.json({ received: true })
  }

  // Look up org via provider_customer_id
  let orgId = webhookEvent.orgId
  let orgName = 'Unknown Organization'
  let billingEmail = ''

  if (!orgId && webhookEvent.customerId) {
    const { data: sub } = await supabase
      .from('org_subscriptions')
      .select('org_id')
      .eq('provider_customer_id', webhookEvent.customerId)
      .limit(1)
      .maybeSingle()

    if (sub) {
      orgId = sub.org_id as string
    }
  }

  if (orgId) {
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, billing_email')
      .eq('id', orgId)
      .single()

    if (org) {
      orgName = org.name as string
      billingEmail = org.billing_email as string
    }
  }

  // Idempotency guard
  const { data: existing } = await supabase
    .from('billing_events')
    .select('id')
    .eq('provider_ref', webhookEvent.providerRef)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ received: true })
  }

  // Insert billing event
  const { data: billingEventRow, error: insertError } = await supabase
    .from('billing_events')
    .insert({
      org_id: orgId ?? null,
      event_type: webhookEvent.eventType,
      amount: webhookEvent.amount ?? null,
      currency: webhookEvent.currency ?? 'USD',
      provider_ref: webhookEvent.providerRef,
      metadata: webhookEvent.metadata ?? {},
    })
    .select('id')
    .single()

  if (insertError || !billingEventRow) {
    console.error('[BILLING_EVENT_INSERT_FAILED]', { code: insertError?.code })
    return NextResponse.json({ error: 'Failed to record billing event' }, { status: 500 })
  }

  // Event-specific handling (same logic as tRPC mutation)
  switch (webhookEvent.eventType) {
    case BillingEventType.CHARGE_FAILED: {
      if (orgId) {
        const gracePeriodEnd = new Date()
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7)

        const subQuery = supabase
          .from('org_subscriptions')
          .update({ grace_period_ends_at: gracePeriodEnd.toISOString() })
          .eq('org_id', orgId)
          .in('status', ['ACTIVE', 'TRIAL'])

        if (webhookEvent.subscriptionId) {
          subQuery.eq('provider_subscription_id', webhookEvent.subscriptionId)
        }

        const { error: updateErr } = await subQuery
        if (updateErr) {
          console.warn('[BILLING_GRACE_PERIOD_UPDATE_FAILED]', { code: updateErr.code, orgId })
        }

        if (billingEmail) {
          void sendBillingNotification(supabase, 'PAYMENT_FAILED', {
            orgName, billingEmail,
            amount: webhookEvent.amount, currency: webhookEvent.currency,
          })
        }
      }
      break
    }

    case BillingEventType.CHARGE_SUCCESS: {
      if (orgId && webhookEvent.amount && webhookEvent.amount > 0) {
        // F3: Atomic grace period clearing + org reactivation via RPC
        const { error: rpcErr } = await supabase.rpc(
          'billing_handle_charge_success',
          {
            p_org_id: orgId,
            p_subscription_id: webhookEvent.subscriptionId ?? null,
          },
        )

        if (rpcErr) {
          console.warn('[BILLING_CHARGE_SUCCESS_RPC_FAILED]', { code: rpcErr.code, orgId })
        }

        if (billingEmail) {
          void sendBillingNotification(supabase, 'PAYMENT_SUCCESS', {
            orgName, billingEmail,
            amount: webhookEvent.amount, currency: webhookEvent.currency,
          })
        }
      }
      break
    }

    case BillingEventType.SUBSCRIPTION_CREATED: {
      if (orgId) {
        const providerSubId = webhookEvent.subscriptionId ?? webhookEvent.providerRef
        const { error: subCreateErr } = await supabase
          .from('org_subscriptions')
          .update({ provider_subscription_id: String(providerSubId) })
          .eq('org_id', orgId)
          .in('status', ['ACTIVE', 'TRIAL'])

        if (subCreateErr) {
          console.warn('[BILLING_SUB_ID_UPDATE_FAILED]', { code: subCreateErr.code, orgId })
        }
      }
      break
    }

    case BillingEventType.SUBSCRIPTION_CANCELLED: {
      if (orgId) {
        const cancelQuery = supabase
          .from('org_subscriptions')
          .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString() })
          .eq('org_id', orgId)
          .in('status', ['ACTIVE', 'TRIAL', 'SUSPENDED'])

        if (webhookEvent.subscriptionId) {
          cancelQuery.eq('provider_subscription_id', webhookEvent.subscriptionId)
        }

        const { error: cancelErr } = await cancelQuery
        if (cancelErr) {
          console.warn('[BILLING_CANCEL_FAILED]', { code: cancelErr.code, orgId })
        }
      }
      break
    }

    case BillingEventType.REFUND:
      break
  }

  // Audit log
  const audit = new AuditLogger(supabase)
  try {
    await audit.emit({
      action: `BILLING_${webhookEvent.eventType}`,
      resourceType: 'BillingEvent',
      resourceId: billingEventRow.id as string,
      actorId: 'SYSTEM',
      actorRole: 'SYSTEM',
      outcome: 'SUCCESS',
      sessionId: 'webhook',
      metadata: {
        amount: webhookEvent.amount,
        currency: webhookEvent.currency,
        providerRef: webhookEvent.providerRef,
      },
    })
  } catch {
    console.warn('[AUDIT_FAILURE]', { action: `BILLING_${webhookEvent.eventType}` })
  }

  return NextResponse.json({ received: true })
}
