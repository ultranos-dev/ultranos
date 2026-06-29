import type { SupabaseClient } from '@supabase/supabase-js'
import { AuditLogger } from '@ultranos/audit-logger'
import { getRolesForModule } from '@ultranos/shared-types'

/**
 * Subscription lifecycle side-effect handlers (Story 27.7).
 *
 * Manages user suspension on module cancellation and reactivation
 * on module re-subscription. All operations are idempotent.
 */

/**
 * Schedule user suspension when a module subscription is cancelled.
 * Marks affected users (those whose role requires the cancelled module)
 * with a pending suspension date matching the subscription's expires_at.
 *
 * AC #3: Existing users with roles tied to a cancelled module are
 * transitioned to SUSPENDED at end of billing period.
 *
 * Throws on DB query failure so the caller knows scheduling failed.
 */
export async function scheduleUserSuspension(
  supabase: SupabaseClient,
  orgId: string,
  moduleCode: string,
  effectiveDate: Date,
  actorId: string,
  sessionId: string,
): Promise<{ scheduledCount: number }> {
  const affectedRoles = getRolesForModule(moduleCode)
  if (affectedRoles.length === 0) return { scheduledCount: 0 }

  // Find active practitioners in this org with affected roles
  const { data: practitioners, error } = await supabase
    .from('practitioners')
    .select('id, auth_user_id, role')
    .eq('org_id', orgId)
    .in('role', affectedRoles)
    .is('suspended_at', null)

  // P3: Distinguish "no users found" from "query failed"
  if (error) {
    throw new Error(`Failed to query practitioners for suspension scheduling: ${error.message}`)
  }

  if (!practitioners || practitioners.length === 0) return { scheduledCount: 0 }

  let scheduledCount = 0

  for (const p of practitioners) {
    const { error: updateError } = await supabase
      .from('practitioners')
      .update({
        pending_suspension_date: effectiveDate.toISOString(),
        suspension_reason: `MODULE_CANCELLED:${moduleCode}`,
      })
      .eq('id', p.id)

    if (!updateError) scheduledCount++
  }

  // Audit the scheduling
  const audit = new AuditLogger(supabase, orgId)
  try {
    await audit.emit({
      action: 'UPDATE',
      resourceType: 'USER_ACCOUNT',
      resourceId: `org:${orgId}:module:${moduleCode}`,
      actorId,
      actorRole: 'SYSTEM',
      outcome: 'SUCCESS',
      sessionId,
      metadata: {
        event: 'SUSPENSION_SCHEDULED',
        moduleCode,
        orgId,
        scheduledCount,
        effectiveDate: effectiveDate.toISOString(),
      },
    })
  } catch {
    console.warn('[AUDIT_FAILURE]', { action: 'UPDATE', resourceType: 'USER_ACCOUNT' })
  }

  return { scheduledCount }
}

/**
 * Suspend a single user. Updates the practitioner record, Supabase Auth
 * app_metadata (included in JWT claims), and invalidates active sessions.
 *
 * AC #4: Suspended users cannot log in but their audit trail and clinical
 * data are preserved — no deletion.
 *
 * D1(C): Writes status to app_metadata (promoted to JWT automatically by
 * Supabase) and signs out the user to invalidate refresh tokens.
 *
 * P1: Checks return values and throws on failure to prevent split state.
 */
export async function suspendUser(
  supabase: SupabaseClient,
  userId: string,
  practitionerId: string,
  reason: string,
  actorId: string,
  sessionId: string,
  orgId?: string,
): Promise<void> {
  const now = new Date().toISOString()

  // Update practitioner record
  const { error: dbError } = await supabase
    .from('practitioners')
    .update({
      suspended_at: now,
      suspension_reason: reason,
      pending_suspension_date: null,
    })
    .eq('id', practitionerId)

  if (dbError) {
    throw new Error(`Failed to update practitioner ${practitionerId}: ${dbError.message}`)
  }

  // Update Supabase Auth app_metadata (included in JWT claims automatically)
  const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: {
      status: 'SUSPENDED',
      suspended_at: now,
      suspension_reason: reason,
    },
  })

  if (authError) {
    // Rollback the practitioner update to avoid split state
    await supabase
      .from('practitioners')
      .update({
        suspended_at: null,
        suspension_reason: null,
        pending_suspension_date: null,
      })
      .eq('id', practitionerId)
    throw new Error(`Failed to update Auth metadata for user ${userId}: ${authError.message}`)
  }

  // Invalidate active sessions so the user cannot use existing refresh tokens
  await supabase.auth.admin.signOut(userId)

  // Audit the suspension
  const audit = new AuditLogger(supabase, orgId)
  try {
    await audit.emit({
      action: 'UPDATE',
      resourceType: 'USER_ACCOUNT',
      resourceId: practitionerId,
      actorId,
      actorRole: 'SYSTEM',
      outcome: 'SUCCESS',
      sessionId,
      metadata: {
        event: 'USER_SUSPENDED',
        userId,
        reason,
      },
    })
  } catch {
    console.warn('[AUDIT_FAILURE]', { action: 'UPDATE', resourceType: 'USER_ACCOUNT' })
  }
}

/**
 * Process pending suspensions. Intended to be called by a daily cron job.
 * Finds all practitioners with pending_suspension_date <= now and suspends them.
 * Idempotent: already-suspended users are skipped.
 *
 * P2: Each iteration is wrapped in try-catch so one failure does not abort the batch.
 * P4: Skips practitioners with null auth_user_id.
 */
export async function processPendingSuspensions(
  supabase: SupabaseClient,
): Promise<{ processedCount: number; failedCount: number }> {
  const now = new Date().toISOString()

  const { data: pending, error } = await supabase
    .from('practitioners')
    .select('id, auth_user_id, suspension_reason, org_id')
    .lte('pending_suspension_date', now)
    .is('suspended_at', null)

  if (error || !pending || pending.length === 0) return { processedCount: 0, failedCount: 0 }

  let processedCount = 0
  let failedCount = 0

  for (const p of pending) {
    // P4: Skip practitioners with null auth_user_id
    if (!p.auth_user_id) {
      console.warn('[SUSPENSION] Skipping practitioner with null auth_user_id:', p.id)
      failedCount++
      continue
    }

    // P2: Try-catch per iteration so one failure does not abort the batch
    try {
      await suspendUser(
        supabase,
        p.auth_user_id as string,
        p.id as string,
        (p.suspension_reason as string) ?? 'MODULE_CANCELLED',
        'SYSTEM',
        'cron',
        (p.org_id as string) ?? undefined,
      )
      processedCount++
    } catch (err) {
      console.warn('[SUSPENSION] Failed to suspend practitioner:', p.id, err)
      failedCount++
    }
  }

  return { processedCount, failedCount }
}

/**
 * Reactivate users who were suspended due to a specific module cancellation.
 * Called when a module is re-subscribed (addModule in Story 27.5).
 *
 * Only reactivates users whose suspension_reason matches MODULE_CANCELLED:<moduleCode>.
 * Users suspended for other reasons are NOT affected.
 *
 * P1: Checks return values and throws on failure to prevent split state.
 * D1(C): Writes status to app_metadata and does not invalidate sessions
 * (user should be able to log in again immediately).
 */
export async function reactivateUsersForModule(
  supabase: SupabaseClient,
  orgId: string,
  moduleCode: string,
  actorId: string,
  sessionId: string,
): Promise<{ reactivatedCount: number }> {
  const suspensionReason = `MODULE_CANCELLED:${moduleCode}`

  // Find suspended practitioners with matching reason
  const { data: suspended, error } = await supabase
    .from('practitioners')
    .select('id, auth_user_id')
    .eq('org_id', orgId)
    .eq('suspension_reason', suspensionReason)
    .not('suspended_at', 'is', null)

  if (error || !suspended || suspended.length === 0) return { reactivatedCount: 0 }

  let reactivatedCount = 0

  for (const p of suspended) {
    // Clear suspension fields on practitioner record
    const { error: dbError } = await supabase
      .from('practitioners')
      .update({
        suspended_at: null,
        suspension_reason: null,
        pending_suspension_date: null,
      })
      .eq('id', p.id)

    if (dbError) {
      console.warn('[REACTIVATION] Failed to clear practitioner record:', p.id, dbError.message)
      continue
    }

    // Restore Supabase Auth app_metadata
    const { error: authError } = await supabase.auth.admin.updateUserById(p.auth_user_id as string, {
      app_metadata: {
        status: 'ACTIVE',
        suspended_at: null,
        suspension_reason: null,
      },
    })

    if (authError) {
      // Rollback DB change to avoid split state
      await supabase
        .from('practitioners')
        .update({
          suspended_at: new Date().toISOString(),
          suspension_reason: suspensionReason,
        })
        .eq('id', p.id)
      console.warn('[REACTIVATION] Failed to update Auth metadata, rolled back:', p.id, authError.message)
      continue
    }

    reactivatedCount++
  }

  // Audit the reactivation
  const audit = new AuditLogger(supabase, orgId)
  try {
    await audit.emit({
      action: 'UPDATE',
      resourceType: 'USER_ACCOUNT',
      resourceId: `org:${orgId}:module:${moduleCode}`,
      actorId,
      actorRole: 'SYSTEM',
      outcome: 'SUCCESS',
      sessionId,
      metadata: {
        event: 'USERS_REACTIVATED',
        moduleCode,
        orgId,
        reactivatedCount,
      },
    })
  } catch {
    console.warn('[AUDIT_FAILURE]', { action: 'UPDATE', resourceType: 'USER_ACCOUNT' })
  }

  return { reactivatedCount }
}
