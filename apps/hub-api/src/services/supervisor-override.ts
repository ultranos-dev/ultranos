import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Story 57.2 — Real supervisor override verification (H-HUB-2).
 *
 * The previous override was self-attested: any non-empty reason bypassed the gate
 * and `override_supervisor` was set to the dispensing pharmacist's OWN id. This
 * service enforces a genuine second credential:
 *   - the supervisor is a DISTINCT practitioner from the dispensing pharmacist
 *     (no self-supervision),
 *   - is supervisor-capable (DOCTOR / CLINICIAN / ADMIN — a prescriber/manager,
 *     never another PHARMACIST or LAB_TECH),
 *   - is in the SAME org as the dispensing pharmacist,
 *   - has an active (KYC ACTIVE) account,
 *   - and presents a valid supervisor PIN, verified server-side against the
 *     SHA-256 hash stored in practitioners.supervisor_pin_hash.
 *
 * Trust-model note (offline): a dispense created offline cannot reach the Hub to
 * verify the PIN at dispense time. The spoke records the supervisor identity +
 * reason locally and queues the attestation; the Hub verifies at drain (this same
 * function). A failed drain-time verification does NOT roll back the committed
 * dispense (it already happened at the point of care) — instead the dispense_review
 * is transitioned to FLAGGED for physician/pharmacy-manager escalation. This is the
 * documented residual risk: offline overrides are trusted at the point of care and
 * server-verified after the fact.
 *
 * CLAUDE.md Rule #1: never logs the PIN, the supervisor name, or any PHI. Only
 * opaque ids and outcome codes.
 */

/** Roles that may authorise a dispense override for a pharmacist. */
export const SUPERVISOR_CAPABLE_ROLES = ['DOCTOR', 'CLINICIAN', 'ADMIN'] as const

export type SupervisorVerifyResult =
  | { ok: true; supervisorId: string }
  | { ok: false; code: SupervisorVerifyFailureCode }

export type SupervisorVerifyFailureCode =
  | 'SELF_SUPERVISION'        // supervisor id equals the dispensing pharmacist
  | 'SUPERVISOR_NOT_FOUND'    // no practitioner with that id
  | 'NOT_SUPERVISOR_CAPABLE'  // wrong role
  | 'CROSS_ORG'               // supervisor belongs to a different org
  | 'SUPERVISOR_INACTIVE'     // KYC not ACTIVE
  | 'NO_PIN_SET'              // supervisor has not configured a PIN
  | 'INVALID_PIN'             // PIN hash mismatch
  | 'LOOKUP_ERROR'            // DB error during verification

/** SHA-256 hex of a supervisor PIN — matches the hashing convention used elsewhere in the Hub. */
export function hashSupervisorPin(pin: string): string {
  return createHash('sha256').update(pin).digest('hex')
}

export interface SupervisorAuthInput {
  /** The supervisor's practitioner id (bare UUID). */
  supervisorId: string
  /** The supervisor's override PIN (plaintext over the wire; TLS-protected, never stored). */
  supervisorPin: string
}

/**
 * Verify a supervisor override credential server-side.
 *
 * @param dispensingPharmacistId  ctx.user.sub of the pharmacist recording the dispense
 * @param dispensingOrgId         ctx.user.orgId of the pharmacist (same-org requirement)
 */
export async function verifySupervisorOverride(
  supabase: SupabaseClient,
  auth: SupervisorAuthInput,
  dispensingPharmacistId: string,
  dispensingOrgId: string | null,
): Promise<SupervisorVerifyResult> {
  // Reject self-supervision up front — a pharmacist can never supervise their own override.
  if (auth.supervisorId === dispensingPharmacistId) {
    return { ok: false, code: 'SELF_SUPERVISION' }
  }

  const { data: supervisor, error } = await supabase
    .from('practitioners')
    .select('id, role, org_id, kyc_status, supervisor_pin_hash')
    .eq('id', auth.supervisorId)
    .maybeSingle()

  if (error) {
    console.error('[supervisor-override] lookup error', { code: error.code })
    return { ok: false, code: 'LOOKUP_ERROR' }
  }
  if (!supervisor) {
    return { ok: false, code: 'SUPERVISOR_NOT_FOUND' }
  }

  if (!(SUPERVISOR_CAPABLE_ROLES as readonly string[]).includes(supervisor.role as string)) {
    return { ok: false, code: 'NOT_SUPERVISOR_CAPABLE' }
  }

  // Same-org requirement: an override supervisor must belong to the pharmacist's org.
  if (!dispensingOrgId || supervisor.org_id !== dispensingOrgId) {
    return { ok: false, code: 'CROSS_ORG' }
  }

  if (supervisor.kyc_status !== 'ACTIVE') {
    return { ok: false, code: 'SUPERVISOR_INACTIVE' }
  }

  if (!supervisor.supervisor_pin_hash) {
    return { ok: false, code: 'NO_PIN_SET' }
  }

  const presented = hashSupervisorPin(auth.supervisorPin)
  // Constant-time-ish compare via fixed-length hex digests.
  if (presented.length !== supervisor.supervisor_pin_hash.length || presented !== supervisor.supervisor_pin_hash) {
    return { ok: false, code: 'INVALID_PIN' }
  }

  return { ok: true, supervisorId: supervisor.id as string }
}

/**
 * Story 57.2 AC #5: derive the clinical-safety severity metric label from the
 * structured reason code (replaces the free-text prefix heuristic in
 * `detectOverrideSeverity`). Kept deterministic and PHI-free.
 */
export function deriveOverrideSeverity(
  serverInteractionStatus: string | null,
  reasonCode: string | undefined,
): string {
  // A blocked server status is always the most severe classification.
  if (serverInteractionStatus === 'BLOCKED') return 'CONTRAINDICATED'
  switch (reasonCode) {
    case 'CONTRAINDICATED_CLINICALLY_INDICATED':
      return 'CONTRAINDICATED'
    case 'ALLERGY_PREVIOUSLY_TOLERATED':
      return 'ALLERGY_MATCH'
    case 'NO_ALTERNATIVE_AVAILABLE':
    case 'BENEFIT_OUTWEIGHS_RISK':
      return 'MAJOR'
    default:
      return 'MODERATE'
  }
}
