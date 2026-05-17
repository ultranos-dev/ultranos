import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Billing notification types — Story 27.8 AC #6.
 * Grace warning emails (GRACE_WARNING_DAY_1, GRACE_WARNING_DAY_5) are triggered
 * by the subscription_lifecycle cron job (Story 27.9), not by the webhook handler.
 */
export type BillingNotificationType =
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'GRACE_WARNING_DAY_1'
  | 'GRACE_WARNING_DAY_5'
  | 'SUSPENSION'
  | 'ORG_TRIAL_TO_ACTIVE'
  | 'ORG_TRIAL_EXPIRED'
  | 'ORG_SUSPENDED'
  | 'ORG_CANCELLED_BY_ADMIN'
  | 'ORG_REACTIVATED'
  | 'ORG_SUSPENDED_TO_CANCELLED'

interface NotificationParams {
  orgName: string
  billingEmail: string
  amount?: number
  currency?: string
}

const TEMPLATES: Record<BillingNotificationType, (p: NotificationParams) => { subject: string; body: string }> = {
  PAYMENT_SUCCESS: (p) => ({
    subject: `Payment received for ${p.orgName}`,
    body: `Payment of ${p.amount ?? 0} ${p.currency ?? 'USD'} received for ${p.orgName}.`,
  }),
  PAYMENT_FAILED: (p) => ({
    subject: `Payment failed for ${p.orgName}`,
    body: `Payment failed for ${p.orgName}. Please update your payment method within 7 days to avoid service suspension.`,
  }),
  GRACE_WARNING_DAY_1: (p) => ({
    subject: `Payment overdue — ${p.orgName}`,
    body: `Your payment is overdue. You have 6 days remaining before service suspension.`,
  }),
  GRACE_WARNING_DAY_5: (p) => ({
    subject: `URGENT: Payment overdue — ${p.orgName}`,
    body: `URGENT: Your payment is 5 days overdue. Service will be suspended in 2 days.`,
  }),
  SUSPENSION: (p) => ({
    subject: `Service suspended — ${p.orgName}`,
    body: `Your organization's access has been suspended due to non-payment.`,
  }),
  ORG_TRIAL_TO_ACTIVE: (p) => ({
    subject: `Welcome! Your subscription is now active — ${p.orgName}`,
    body: `Welcome! Your subscription for ${p.orgName} is now active.`,
  }),
  ORG_TRIAL_EXPIRED: (p) => ({
    subject: `Trial expired — ${p.orgName}`,
    body: `Your trial for ${p.orgName} has expired. Subscribe to continue using Ultranos.`,
  }),
  ORG_SUSPENDED: (p) => ({
    subject: `Access suspended — ${p.orgName}`,
    body: `Your access for ${p.orgName} has been suspended due to non-payment.`,
  }),
  ORG_CANCELLED_BY_ADMIN: (p) => ({
    subject: `Subscription cancelled — ${p.orgName}`,
    body: `Your subscription for ${p.orgName} has been cancelled. You have 90 days of read-only access to export your data.`,
  }),
  ORG_REACTIVATED: (p) => ({
    subject: `Access restored — ${p.orgName}`,
    body: `Payment received! Your access for ${p.orgName} has been restored.`,
  }),
  ORG_SUSPENDED_TO_CANCELLED: (p) => ({
    subject: `Organization cancelled — ${p.orgName}`,
    body: `Your organization ${p.orgName} has been cancelled after 30 days of suspension. You have 90 days of read-only access to export your data.`,
  }),
}

/**
 * Send a billing notification email.
 * Fire-and-forget — failures are logged but do not block the caller.
 * No PHI in any email template — only org name, amounts, and dates (AC #6 rule #7).
 */
export async function sendBillingNotification(
  supabase: SupabaseClient,
  type: BillingNotificationType,
  params: NotificationParams,
): Promise<void> {
  const template = TEMPLATES[type]
  const { subject, body } = template(params)

  try {
    // Insert into a notifications queue table for async dispatch.
    // If the table doesn't exist yet, log and skip gracefully.
    const { error } = await supabase
      .from('notification_queue')
      .insert({
        channel: 'email',
        recipient: params.billingEmail,
        subject,
        body,
        metadata: { type, orgName: params.orgName },
      })

    if (error) {
      console.warn('[BILLING_NOTIFICATION]', { type, error: error.code })
    }
  } catch {
    // Fire-and-forget — notification failure must not block billing flow
    console.warn('[BILLING_NOTIFICATION_DISPATCH_FAILED]', { type })
  }
}
