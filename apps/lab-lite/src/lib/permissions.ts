/**
 * Story 42.5 — Role-Permission Enforcement for Authorization
 * Task 7: Determines what authorization actions each role can perform.
 *
 * Role-Permission Matrix:
 * Action              | LAB_TECH | SENIOR_TECH | SUPERVISOR | LAB_MANAGER
 * --------------------|----------|-------------|------------|------------
 * View auth queue     | No       | Yes (filt.) | Yes        | Yes
 * Approve routine     | No       | Yes(notOwn) | Yes        | Yes
 * Approve critical    | No       | No          | Yes        | Yes
 * Reject              | No       | No          | Yes        | Yes
 * Hold                | No       | Yes         | Yes        | Yes
 */
import { LabRole } from '@ultranos/shared-types'
import type { AbnormalityFlag, AuthorizableResult } from '../types/authorization'

const CRITICAL_FLAGS: readonly AbnormalityFlag[] = ['LL', 'HH']

function hasCriticalFlags(flags: AbnormalityFlag[]): boolean {
  return flags.some((f) => CRITICAL_FLAGS.includes(f))
}

/**
 * Returns true if the role can access the authorization queue at all.
 * LAB_TECH cannot — they have no authorization responsibilities.
 */
export function canAccessAuthorizationQueue(role: LabRole): boolean {
  return role !== LabRole.LAB_TECH
}

/**
 * Returns true if the actor can authorize (approve) the given result.
 *
 * Rules:
 * - LAB_TECH: never
 * - SENIOR_TECH: only routine results (no flags at all) they did NOT enter
 * - SUPERVISOR/LAB_MANAGER: all results they did NOT enter themselves
 *   (self-authorization returns false — use canBreakGlassAuthorize for emergency override)
 */
export function canAuthorize(
  role: LabRole,
  actorId: string,
  result: AuthorizableResult,
): boolean {
  if (role === LabRole.LAB_TECH) return false

  // Self-authorization is always blocked by default (four-eyes principle)
  if (result.enteredBy === actorId) return false

  if (role === LabRole.SENIOR_TECH) {
    // SENIOR_TECH: only routine (zero flags) results they didn't enter
    return result.abnormalityFlags.length === 0
  }

  // SUPERVISOR and LAB_MANAGER: all results (including critical)
  return true
}

/**
 * Break-glass self-authorization for SUPERVISOR and LAB_MANAGER only.
 * Returns true if the role is eligible for break-glass override.
 * Caller must audit-log this as BREAK_GLASS.
 */
export function canBreakGlassAuthorize(role: LabRole): boolean {
  return role === LabRole.SUPERVISOR || role === LabRole.LAB_MANAGER
}

/**
 * Returns true if the actor can reject (return to tech) a result.
 * Only SUPERVISOR and LAB_MANAGER can reject.
 */
export function canReject(role: LabRole): boolean {
  return role === LabRole.SUPERVISOR || role === LabRole.LAB_MANAGER
}

/**
 * Returns true if the actor can place a result on hold.
 * SENIOR_TECH, SUPERVISOR, and LAB_MANAGER can hold.
 */
export function canHold(role: LabRole): boolean {
  return role !== LabRole.LAB_TECH
}

/**
 * Returns true if the result has critical values (LL or HH flags).
 * Critical results require SUPERVISOR or LAB_MANAGER with re-authentication.
 */
export function isCriticalResult(flags: AbnormalityFlag[]): boolean {
  return hasCriticalFlags(flags)
}
