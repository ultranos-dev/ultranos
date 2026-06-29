import { TRPCError } from '@trpc/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AuditLogger } from '@ultranos/audit-logger'
import { sendBillingNotification, type BillingNotificationType } from './billing-notifications'

/**
 * Subscription state machine — Story 27.9 AC #1.
 *
 * Single source of truth for all org status transitions. No code path
 * should update `organizations.status` directly — always use `transitionOrg()`.
 *
 * State machine:
 *   TRIAL -> ACTIVE | CANCELLED
 *   ACTIVE -> SUSPENDED | CANCELLED
 *   SUSPENDED -> ACTIVE | CANCELLED
 *   CANCELLED -> (terminal — no transitions out)
 */

export type OrgStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'

const ALLOWED_TRANSITIONS: Record<OrgStatus, OrgStatus[]> = {
  TRIAL: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['SUSPENDED', 'CANCELLED'],
  SUSPENDED: ['ACTIVE', 'CANCELLED'],
  CANCELLED: [], // terminal state — no transitions out
}

/**
 * Email template mapping for each transition pair.
 * No PHI in any template — only org name, status, and dates (AC #4).
 */
const TRANSITION_EMAIL_MAP: Record<string, BillingNotificationType> = {
  'TRIAL->ACTIVE': 'ORG_TRIAL_TO_ACTIVE',
  'TRIAL->CANCELLED': 'ORG_TRIAL_EXPIRED',
  'ACTIVE->SUSPENDED': 'ORG_SUSPENDED',
  'ACTIVE->CANCELLED': 'ORG_CANCELLED_BY_ADMIN',
  'SUSPENDED->ACTIVE': 'ORG_REACTIVATED',
  'SUSPENDED->CANCELLED': 'ORG_SUSPENDED_TO_CANCELLED',
}

/**
 * Returns true if the transition from `current` to `target` is allowed.
 */
export function validateTransition(current: OrgStatus, target: OrgStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[current]
  return allowed !== undefined && allowed.includes(target)
}

/**
 * Context for transitionOrg — matches TRPCContext shape but accepts
 * partial user for system/cron invocations.
 */
export interface TransitionContext {
  supabase: SupabaseClient
  user?: {
    sub?: string
    role?: string
    sessionId?: string
  } | null
}

/**
 * Transition an organization to a new status. This is the ONLY way to
 * change `organizations.status`. It ensures:
 * 1. The transition is valid per the state machine
 * 2. Relevant timestamps are set (cancelled_at, suspended_at)
 * 3. An audit event is emitted
 * 4. An email notification is sent to the org's billing email
 *
 * Throws TRPCError BAD_REQUEST on invalid transition.
 * Throws TRPCError INTERNAL_SERVER_ERROR on DB failure.
 */
export async function transitionOrg(
  orgId: string,
  targetStatus: OrgStatus,
  reason: string,
  ctx: TransitionContext,
): Promise<void> {
  // Fetch current org status and billing info
  const { data: org, error: fetchError } = await ctx.supabase
    .from('organizations')
    .select('id, status, name, billing_email')
    .eq('id', orgId)
    .single()

  if (fetchError || !org) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to fetch organization: ${fetchError?.message ?? 'not found'}`,
    })
  }

  const currentStatus = org.status as OrgStatus

  // Validate transition
  if (!validateTransition(currentStatus, targetStatus)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Invalid status transition: ${currentStatus} -> ${targetStatus}`,
    })
  }

  // Build update payload with relevant timestamps
  const now = new Date().toISOString()
  const updatePayload: Record<string, unknown> = { status: targetStatus }

  if (targetStatus === 'CANCELLED') {
    updatePayload.cancelled_at = now
  }
  if (targetStatus === 'SUSPENDED') {
    updatePayload.suspended_at = now
  }
  // Clear suspension timestamp when reactivating
  if (targetStatus === 'ACTIVE' && currentStatus === 'SUSPENDED') {
    updatePayload.suspended_at = null
  }

  // Update organization status
  // Optimistic concurrency: only update if status hasn't changed since we read it
  const { error: updateError, count } = await ctx.supabase
    .from('organizations')
    .update(updatePayload)
    .eq('id', orgId)
    .eq('status', currentStatus)

  if (updateError) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to update organization status: ${updateError.message}`,
    })
  }

  if (count === 0) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `Organization status changed concurrently (expected: ${currentStatus})`,
    })
  }

  // AC #4: Emit audit event — no PHI, only org_id and transition metadata
  const audit = new AuditLogger(ctx.supabase, orgId)
  try {
    await audit.emit({
      action: 'ORG_STATUS_TRANSITION',
      resourceType: 'Organization',
      resourceId: orgId,
      actorId: ctx.user?.sub ?? 'SYSTEM',
      actorRole: ctx.user?.role ?? 'SYSTEM',
      outcome: 'SUCCESS',
      sessionId: ctx.user?.sessionId ?? 'cron',
      metadata: {
        previousStatus: currentStatus,
        newStatus: targetStatus,
        reason,
      },
    })
  } catch (auditErr) {
    // Escalate to error level — audit failures on state transitions are compliance-relevant
    console.error('[AUDIT_FAILURE] ORG_STATUS_TRANSITION', { orgId, error: auditErr instanceof Error ? auditErr.message : 'unknown' })

    // Dead-letter: queue for retry so audit trail can be reconstructed
    try {
      await ctx.supabase.from('notification_queue').insert({
        channel: 'audit_retry',
        recipient: 'SYSTEM',
        subject: 'AUDIT_RETRY: ORG_STATUS_TRANSITION',
        body: JSON.stringify({
          action: 'ORG_STATUS_TRANSITION',
          resourceId: orgId,
          actorId: ctx.user?.sub ?? 'SYSTEM',
          metadata: { previousStatus: currentStatus, newStatus: targetStatus, reason },
          failedAt: new Date().toISOString(),
        }),
        metadata: { type: 'audit_dead_letter' },
      })
    } catch {
      // Last resort — if even dead-letter fails, the error log above is the fallback
    }
  }

  // AC #4: Send email notification — fire-and-forget, no PHI
  const emailType = TRANSITION_EMAIL_MAP[`${currentStatus}->${targetStatus}`]
  if (emailType && org.billing_email) {
    void sendBillingNotification(ctx.supabase, emailType, {
      orgName: org.name as string,
      billingEmail: org.billing_email as string,
    })
  }
}
