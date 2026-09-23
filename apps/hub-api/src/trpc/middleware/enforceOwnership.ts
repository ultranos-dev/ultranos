import type { SupabaseClient } from '@supabase/supabase-js'
import { checkConsent } from './enforceConsent'
import type { AuthedTRPCContext } from '@/trpc/init'

/**
 * Object-level ownership + consent resolution for the sync surfaces (Story 56.2 /
 * audit C-SYS-2). sync.pull and sync.push accept a client-supplied patientId /
 * resourceId; `enforceResourceAccess` only proves the *role* may touch a resource
 * *type*, never that this caller may touch THIS patient's row. These helpers add
 * the missing per-object check.
 *
 * Identity conventions (verified against the existing codebase):
 * - PATIENT role: `ctx.user.sub` IS the patient's own `patients.id` — the same
 *   equality `patient.updateTier` (`ctx.user.sub === input.patientId`) and the
 *   guardian router (`ctx.user.sub === input.patientId`) already rely on.
 * - GUARDIAN role: linked wards live in `guardian_links` as
 *   (`guardian_user_id = ctx.user.sub`, `patient_id = <ward>`, `status = 'active'`).
 * - Clinical/admin roles (DOCTOR/CLINICIAN/PHARMACIST/LAB_TECH/ADMIN/SYSTEM):
 *   free-floating-patient tenancy (Epic 27 — shared-schema RLS, patients are NOT
 *   org-scoped) means any verified clinician may reach any patient by design; the
 *   per-patient gate for them is CONSENT, not org membership. Org scoping still
 *   applies to org-owned rows on push (see resolvePushRowOwnership).
 */

/** Roles that own exactly one patient record: their own. */
const SELF_ONLY_ROLES = new Set(['PATIENT'])
/** Roles whose reachable patients are resolved via guardian_links. */
const GUARDIAN_ROLES = new Set(['GUARDIAN'])

export type PullScopeDecision =
  | { allowed: true }
  | { allowed: false; reason: 'not_owner' | 'not_ward' }

/**
 * Resolve whether `user` may pull the record set for `patientId`.
 *
 * PATIENT → only their own id. GUARDIAN → only an active linked ward. Every other
 * (clinical/admin) role → allowed at the ownership layer; consent gating is applied
 * per-resource-type separately (see isConsentGatedType / checkConsent). Fails safe:
 * an unknown/empty role that is neither self nor guardian nor clinical is denied by
 * the caller's RBAC (hasResourceAccess) before reaching here, but if it does, it is
 * treated as clinical-open only when it passed RBAC — this function only *narrows*
 * for the two owner roles.
 */
export async function resolvePullScope(
  supabase: SupabaseClient,
  user: AuthedTRPCContext['user'],
  patientId: string,
): Promise<PullScopeDecision> {
  const role = user.role

  if (SELF_ONLY_ROLES.has(role)) {
    // Convention: a patient's auth `sub` is their `patients.id`.
    return user.sub === patientId ? { allowed: true } : { allowed: false, reason: 'not_owner' }
  }

  if (GUARDIAN_ROLES.has(role)) {
    const { data, error } = await supabase
      .from('guardian_links')
      .select('id')
      .eq('guardian_user_id', user.sub)
      .eq('patient_id', patientId)
      .eq('status', 'active')
      .maybeSingle()
    if (error || !data) return { allowed: false, reason: 'not_ward' }
    return { allowed: true }
  }

  // Clinical / admin roles: reachable per free-floating-patient tenancy.
  return { allowed: true }
}

/**
 * Consent-gated resource types on pull. Mirrors RESOURCE_TO_SCOPE in
 * enforceConsent.ts — these types require an active patient consent before a
 * clinician may read them. Types not listed here (e.g. AllergyIntolerance,
 * MedicationStatement, ServiceRequest) are not consent-gated on the generic pull,
 * consistent with the middleware, which denies-by-default only for mapped types.
 */
const CONSENT_GATED_PULL_TYPES = new Set([
  'Patient',
  'Encounter',
  'ClinicalImpression', // scoped via encounters; gated with clinical notes
  'MedicationRequest',
  'DiagnosticReport',
  'Observation',
])

/** Map a resource type to the consent-scope key used by checkConsent. */
const PULL_TYPE_TO_CONSENT_RESOURCE: Record<string, string> = {
  Patient: 'Patient',
  Encounter: 'Encounter',
  ClinicalImpression: 'Encounter', // SOAP notes ride the clinical-notes scope
  MedicationRequest: 'MedicationRequest',
  DiagnosticReport: 'DiagnosticReport',
  Observation: 'Observation',
}

export function isConsentGatedPullType(resourceType: string): boolean {
  return CONSENT_GATED_PULL_TYPES.has(resourceType)
}

/**
 * For a clinical caller pulling a consent-gated resource type, returns true when an
 * active, unexpired consent exists for the patient at the appropriate scope. Reuses
 * the exact `checkConsent` logic the read endpoints use (enforceConsentMiddleware),
 * so pull and point-read stay consistent. PATIENT/GUARDIAN owners bypass the consent
 * gate for their own/ward record (they are the grantor / act on the grantor's behalf).
 */
export async function hasPullConsent(
  supabase: SupabaseClient,
  role: string,
  resourceType: string,
  patientId: string,
): Promise<boolean> {
  // Owners are not consent-gated against their own record.
  if (SELF_ONLY_ROLES.has(role) || GUARDIAN_ROLES.has(role)) return true
  if (!isConsentGatedPullType(resourceType)) return true
  const consentResource = PULL_TYPE_TO_CONSENT_RESOURCE[resourceType] ?? resourceType
  return checkConsent(supabase, { patientId, resourceType: consentResource })
}

export type PushOwnershipDecision =
  | { allowed: true }
  | { allowed: false; reason: 'cross_org' | 'cross_patient' }

/**
 * Ownership check for an EXISTING row being overwritten by sync.push (audit
 * C-SYS-2 / AC 3). An HLC comparison decides *which version wins* — it must NEVER
 * decide *whether the caller is entitled to write at all*. Before any upsert of a
 * row that already exists we confirm:
 *   - org-scoped tables: the stored row's `org_id` equals the caller's org — a
 *     newer HLC from another org can never re-home the row (and org_id is not
 *     re-stamped for existing rows; only creates take the caller's org).
 *   - patient-scoped tables: for PATIENT/GUARDIAN callers, the stored row's patient
 *     linkage must be their own/ward. Clinical callers are open per tenancy.
 *
 * `existingRow` is the already-fetched stored row (may include org_id + the table's
 * patient column). Returns allowed:true when no violation is detected.
 */
export async function resolvePushRowOwnership(params: {
  supabase: SupabaseClient
  user: AuthedTRPCContext['user']
  tableName: string
  isOrgScoped: boolean
  patientColumn: string | null
  existingRow: Record<string, unknown> | null
}): Promise<PushOwnershipDecision> {
  const { user, isOrgScoped, patientColumn, existingRow } = params
  if (!existingRow) return { allowed: true } // create — no existing owner to protect

  // Org-scoped tables: the stored org must match the caller's org. Reject a
  // cross-org overwrite regardless of HLC ordering.
  if (isOrgScoped) {
    const storedOrg = (existingRow.org_id as string | null) ?? null
    if (storedOrg && user.orgId && storedOrg !== user.orgId) {
      return { allowed: false, reason: 'cross_org' }
    }
    if (storedOrg && !user.orgId) {
      // Caller has no org context but the row is owned by some org — deny.
      return { allowed: false, reason: 'cross_org' }
    }
  }

  // Patient-scoped tables: only the two owner roles are narrowed here. A patient
  // may only overwrite rows linked to their own id; a guardian only their wards'.
  if (patientColumn) {
    const storedPatient = normalizePatientRef(existingRow[patientColumn])
    if (storedPatient) {
      if (SELF_ONLY_ROLES.has(user.role)) {
        if (storedPatient !== user.sub) return { allowed: false, reason: 'cross_patient' }
      } else if (GUARDIAN_ROLES.has(user.role)) {
        const isWard = await isActiveWard(params.supabase, user.sub, storedPatient)
        if (!isWard) return { allowed: false, reason: 'cross_patient' }
      }
    }
  }

  return { allowed: true }
}

/** Strip a `Patient/`-style prefix so bare-UUID and reference columns compare equally. */
function normalizePatientRef(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  return value.includes('/') ? value.split('/').pop() ?? null : value
}

async function isActiveWard(
  supabase: SupabaseClient,
  guardianUserId: string,
  patientId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('guardian_links')
    .select('id')
    .eq('guardian_user_id', guardianUserId)
    .eq('patient_id', patientId)
    .eq('status', 'active')
    .maybeSingle()
  return !error && !!data
}
