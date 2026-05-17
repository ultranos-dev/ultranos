import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * subscription_lifecycle Edge Function — Story 27.9 AC #5.
 *
 * Runs daily at 02:00 UTC via pg_cron. Checks for:
 * 1. Trial expirations → CANCELLED
 * 2. Grace period expirations → SUSPENDED
 * 3. Suspension to cancellation (30 days) → CANCELLED
 * 4. Data purge scheduling (90 days after cancellation)
 * 5. Grace period warning emails (day 1, day 5)
 *
 * Idempotent — running multiple times produces the same result.
 * No PHI in logs — only org_id and transition type.
 */

// Inline state machine logic to avoid cross-package imports in Edge Functions
type OrgStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'

const ALLOWED_TRANSITIONS: Record<OrgStatus, OrgStatus[]> = {
  TRIAL: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['SUSPENDED', 'CANCELLED'],
  SUSPENDED: ['ACTIVE', 'CANCELLED'],
  CANCELLED: [],
}

type BillingNotificationType =
  | 'GRACE_WARNING_DAY_1'
  | 'GRACE_WARNING_DAY_5'
  | 'ORG_TRIAL_EXPIRED'
  | 'ORG_SUSPENDED'
  | 'ORG_SUSPENDED_TO_CANCELLED'

const TRANSITION_EMAIL_MAP: Record<string, BillingNotificationType> = {
  'TRIAL->CANCELLED': 'ORG_TRIAL_EXPIRED',
  'ACTIVE->SUSPENDED': 'ORG_SUSPENDED',
  'SUSPENDED->CANCELLED': 'ORG_SUSPENDED_TO_CANCELLED',
}

const EMAIL_TEMPLATES: Record<BillingNotificationType, (orgName: string) => { subject: string; body: string }> = {
  GRACE_WARNING_DAY_1: (n) => ({
    subject: `Payment overdue — ${n}`,
    body: `Your payment is overdue. You have 6 days remaining before service suspension.`,
  }),
  GRACE_WARNING_DAY_5: (n) => ({
    subject: `URGENT: Payment overdue — ${n}`,
    body: `URGENT: Your payment is 5 days overdue. Service will be suspended in 2 days.`,
  }),
  ORG_TRIAL_EXPIRED: (n) => ({
    subject: `Trial expired — ${n}`,
    body: `Your trial for ${n} has expired. Subscribe to continue using Ultranos.`,
  }),
  ORG_SUSPENDED: (n) => ({
    subject: `Access suspended — ${n}`,
    body: `Your access for ${n} has been suspended due to non-payment.`,
  }),
  ORG_SUSPENDED_TO_CANCELLED: (n) => ({
    subject: `Organization cancelled — ${n}`,
    body: `Your organization ${n} has been cancelled after 30 days of suspension. You have 90 days of read-only access to export your data.`,
  }),
}

Deno.serve(async (req) => {
  // Verify authorization
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const results = {
    trialExpirations: 0,
    gracePeriodExpirations: 0,
    suspensionToCancellation: 0,
    purgeJobsCreated: 0,
    graceWarningsSent: 0,
    errors: [] as string[],
  }

  // ── Check 1: Trial expirations (AC #5) ──
  try {
    const { data: expiredTrials } = await supabase
      .from('organizations')
      .select('id, name, billing_email')
      .eq('status', 'TRIAL')
      .lt('trial_ends_at', new Date().toISOString())

    if (expiredTrials) {
      for (const org of expiredTrials) {
        try {
          await transitionOrg(supabase, org.id, 'TRIAL', 'CANCELLED', 'Trial expired without payment method', org.name, org.billing_email)
          results.trialExpirations++
          console.log('[LIFECYCLE] Trial expired:', org.id)
        } catch (err) {
          results.errors.push(`trial_expiration:${org.id}:${err instanceof Error ? err.message : 'unknown'}`)
        }
      }
    }
  } catch (err) {
    results.errors.push(`trial_query:${err instanceof Error ? err.message : 'unknown'}`)
  }

  // ── Check 2: Grace period expirations → ACTIVE -> SUSPENDED (AC #5) ──
  try {
    const { data: expiredGrace } = await supabase
      .from('org_subscriptions')
      .select('org_id')
      .lt('grace_period_ends_at', new Date().toISOString())
      .in('status', ['ACTIVE', 'TRIAL'])

    if (expiredGrace) {
      // Deduplicate by org_id
      const uniqueOrgIds = [...new Set(expiredGrace.map((s) => s.org_id as string))]

      for (const orgId of uniqueOrgIds) {
        try {
          // Verify org is still ACTIVE (idempotency guard)
          const { data: org } = await supabase
            .from('organizations')
            .select('id, status, name, billing_email')
            .eq('id', orgId)
            .eq('status', 'ACTIVE')
            .single()

          if (org) {
            await transitionOrg(supabase, org.id, 'ACTIVE', 'SUSPENDED', 'Payment grace period expired', org.name, org.billing_email)
            results.gracePeriodExpirations++
            console.log('[LIFECYCLE] Grace period expired:', orgId)
          }
        } catch (err) {
          results.errors.push(`grace_expiration:${orgId}:${err instanceof Error ? err.message : 'unknown'}`)
        }
      }
    }
  } catch (err) {
    results.errors.push(`grace_query:${err instanceof Error ? err.message : 'unknown'}`)
  }

  // ── Check 3: Suspension to cancellation (30 days) (AC #5) ──
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: longSuspended } = await supabase
      .from('organizations')
      .select('id, name, billing_email')
      .eq('status', 'SUSPENDED')
      .lt('suspended_at', thirtyDaysAgo.toISOString())

    if (longSuspended) {
      for (const org of longSuspended) {
        try {
          await transitionOrg(supabase, org.id, 'SUSPENDED', 'CANCELLED', 'Suspended for 30 days without payment resolution', org.name, org.billing_email)
          results.suspensionToCancellation++
          console.log('[LIFECYCLE] Suspension -> Cancelled:', org.id)
        } catch (err) {
          results.errors.push(`suspension_cancel:${org.id}:${err instanceof Error ? err.message : 'unknown'}`)
        }
      }
    }
  } catch (err) {
    results.errors.push(`suspension_query:${err instanceof Error ? err.message : 'unknown'}`)
  }

  // ── Check 4: Data purge scheduling (90 days after cancellation) (AC #3) ──
  try {
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const { data: expiredCancelled } = await supabase
      .from('organizations')
      .select('id')
      .eq('status', 'CANCELLED')
      .lt('cancelled_at', ninetyDaysAgo.toISOString())

    if (expiredCancelled) {
      for (const org of expiredCancelled) {
        try {
          // Check if a purge job already exists for this org (avoid duplicates)
          const { data: existingJob } = await supabase
            .from('data_purge_jobs')
            .select('id')
            .eq('org_id', org.id)
            .in('status', ['PENDING', 'CONFIRMED', 'EXECUTING'])
            .limit(1)

          if (!existingJob || existingJob.length === 0) {
            // Use onConflict to prevent duplicates from concurrent cron runs.
            // Requires a unique partial index: CREATE UNIQUE INDEX ON data_purge_jobs(org_id)
            // WHERE status IN ('PENDING', 'CONFIRMED', 'EXECUTING')
            const { error: insertError } = await supabase
              .from('data_purge_jobs')
              .insert({
                org_id: org.id,
                scheduled_at: new Date().toISOString(),
              })

            if (insertError) {
              // Ignore unique constraint violations (concurrent insert won race)
              if (insertError.code !== '23505') {
                results.errors.push(`purge_insert:${org.id}:${insertError.message}`)
              }
            } else {
              results.purgeJobsCreated++
              console.log('[LIFECYCLE] Purge job created:', org.id)
            }
          }
        } catch (err) {
          results.errors.push(`purge_schedule:${org.id}:${err instanceof Error ? err.message : 'unknown'}`)
        }
      }
    }
  } catch (err) {
    results.errors.push(`purge_query:${err instanceof Error ? err.message : 'unknown'}`)
  }

  // ── Check 5: Grace period warning emails (AC #5) ──
  try {
    const now = new Date()

    // Day 1 warnings: grace_period_ends_at is ~6 days from now (set yesterday)
    const day1Lower = new Date(now)
    day1Lower.setDate(day1Lower.getDate() + 5)
    const day1Upper = new Date(now)
    day1Upper.setDate(day1Upper.getDate() + 7)

    const { data: day1Orgs } = await supabase
      .from('org_subscriptions')
      .select('org_id, organizations!inner(id, name, billing_email)')
      .gt('grace_period_ends_at', day1Lower.toISOString())
      .lte('grace_period_ends_at', day1Upper.toISOString())
      .in('status', ['ACTIVE', 'TRIAL'])

    if (day1Orgs) {
      for (const sub of day1Orgs) {
        const org = sub.organizations as unknown as { id: string; name: string; billing_email: string }
        if (org?.billing_email) {
          const alreadySent = await wasNotificationSentRecently(supabase, org.billing_email, 'GRACE_WARNING_DAY_1')
          if (!alreadySent) {
            await sendNotification(supabase, 'GRACE_WARNING_DAY_1', org.name, org.billing_email)
            results.graceWarningsSent++
          }
        }
      }
    }

    // Day 5 warnings: grace_period_ends_at is ~2 days from now (set 5 days ago)
    const day5Lower = new Date(now)
    day5Lower.setDate(day5Lower.getDate() + 1)
    const day5Upper = new Date(now)
    day5Upper.setDate(day5Upper.getDate() + 3)

    const { data: day5Orgs } = await supabase
      .from('org_subscriptions')
      .select('org_id, organizations!inner(id, name, billing_email)')
      .gt('grace_period_ends_at', day5Lower.toISOString())
      .lte('grace_period_ends_at', day5Upper.toISOString())
      .in('status', ['ACTIVE', 'TRIAL'])

    if (day5Orgs) {
      for (const sub of day5Orgs) {
        const org = sub.organizations as unknown as { id: string; name: string; billing_email: string }
        if (org?.billing_email) {
          const alreadySent = await wasNotificationSentRecently(supabase, org.billing_email, 'GRACE_WARNING_DAY_5')
          if (!alreadySent) {
            await sendNotification(supabase, 'GRACE_WARNING_DAY_5', org.name, org.billing_email)
            results.graceWarningsSent++
          }
        }
      }
    }
  } catch (err) {
    results.errors.push(`grace_warnings:${err instanceof Error ? err.message : 'unknown'}`)
  }

  console.log('[LIFECYCLE] Complete:', JSON.stringify(results))
  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  })
})

/**
 * Transition an organization's status with audit logging and email notification.
 * Inline implementation for Edge Function (cannot import from hub-api).
 */
async function transitionOrg(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  currentStatus: OrgStatus,
  targetStatus: OrgStatus,
  reason: string,
  orgName: string,
  billingEmail: string,
): Promise<void> {
  // Validate transition
  if (!ALLOWED_TRANSITIONS[currentStatus]?.includes(targetStatus)) {
    throw new Error(`Invalid transition: ${currentStatus} -> ${targetStatus}`)
  }

  // Build update payload
  const now = new Date().toISOString()
  const updatePayload: Record<string, unknown> = { status: targetStatus }

  if (targetStatus === 'CANCELLED') updatePayload.cancelled_at = now
  if (targetStatus === 'SUSPENDED') updatePayload.suspended_at = now
  if (targetStatus === 'ACTIVE' && currentStatus === 'SUSPENDED') updatePayload.suspended_at = null

  const { error: updateError, count } = await supabase
    .from('organizations')
    .update(updatePayload)
    .eq('id', orgId)
    .eq('status', currentStatus) // Optimistic concurrency — only update if status hasn't changed

  if (updateError) {
    throw new Error(`Failed to update org ${orgId}: ${updateError.message}`)
  }

  if (count === 0) {
    throw new Error(`Concurrent status change on org ${orgId} (expected: ${currentStatus})`)
  }

  // Audit event — no PHI
  try {
    await supabase.rpc('audit_emit_with_lock', {
      p_id: crypto.randomUUID(),
      p_timestamp: now,
      p_actor_id: 'SYSTEM',
      p_actor_role: 'SYSTEM',
      p_action: 'ORG_STATUS_TRANSITION',
      p_resource_type: 'Organization',
      p_resource_id: orgId,
      p_patient_id: null,
      p_session_id: 'cron',
      p_device_id: null,
      p_source_ip_hash: null,
      p_outcome: 'SUCCESS',
      p_denial_reason: null,
      p_metadata: {
        previousStatus: currentStatus,
        newStatus: targetStatus,
        reason,
      },
    })
  } catch {
    console.warn('[AUDIT_FAILURE] ORG_STATUS_TRANSITION', orgId)
  }

  // Email notification — fire-and-forget
  const emailType = TRANSITION_EMAIL_MAP[`${currentStatus}->${targetStatus}`]
  if (emailType && billingEmail) {
    await sendNotification(supabase, emailType, orgName, billingEmail)
  }
}

/**
 * Check if a notification of the given type was already sent to this recipient
 * within the last 48 hours (prevents duplicate warning emails on consecutive cron runs).
 */
async function wasNotificationSentRecently(
  supabase: ReturnType<typeof createClient>,
  recipient: string,
  type: BillingNotificationType,
): Promise<boolean> {
  try {
    const cutoff = new Date()
    cutoff.setHours(cutoff.getHours() - 48)

    const { data } = await supabase
      .from('notification_queue')
      .select('id')
      .eq('recipient', recipient)
      .eq('metadata->>type', type)
      .gt('created_at', cutoff.toISOString())
      .limit(1)

    return (data?.length ?? 0) > 0
  } catch {
    // If dedup check fails, send the email anyway (better duplicate than missing)
    return false
  }
}

/**
 * Send a notification email via the notification_queue table.
 * Fire-and-forget — failures logged but don't block.
 */
async function sendNotification(
  supabase: ReturnType<typeof createClient>,
  type: BillingNotificationType,
  orgName: string,
  billingEmail: string,
): Promise<void> {
  const template = EMAIL_TEMPLATES[type]
  if (!template) return

  const { subject, body } = template(orgName)

  try {
    await supabase.from('notification_queue').insert({
      channel: 'email',
      recipient: billingEmail,
      subject,
      body,
      metadata: { type, orgName },
    })
  } catch {
    console.warn('[NOTIFICATION_FAILED]', { type })
  }
}
