import { TRPCError } from '@trpc/server'
import { protectedProcedure } from './init'
import type { LabStatus, LabRole } from '@ultranos/shared-types'

/**
 * RBAC role-to-FHIR-resource permission map.
 * Defines which FHIR resource types each role can access and what operations.
 *
 * AC 3:
 * - CLINICIAN (DOCTOR): Full access to assigned patients, encounters, observations, conditions, medication requests.
 * - PHARMACIST: MedicationRequest (Read), MedicationDispense (Read/Write). No SOAP notes or vitals.
 * - PATIENT: Own Patient, Consent, and Medical History only.
 * - ADMIN: All resources.
 */
const CLINICIAN_RESOURCES = new Set([
  'Patient',
  'Encounter',
  'Observation',
  'Condition',
  'MedicationRequest',
  'MedicationDispense',
  'MedicationStatement',
  'ClinicalImpression',
  'DiagnosticReport',
  'ServiceRequest',
  'Consent',
  'AllergyIntolerance',
  // Appointment scheduling — clinicians book/manage their own appointments and
  // (via slot management) their availability. Without this, every non-ADMIN
  // caller of appointment.* was FORBIDDEN by enforceResourceAccess('Appointment'),
  // so the whole scheduling surface (create/list/status/sync) was hub-inaccessible.
  // Ownership scoping (participant / practitioner match) is enforced per-procedure
  // in appointment.ts — RBAC only opens the resource type to the role.
  'Appointment',
  'Slot',
])

/**
 * Story 62.2 (M-ADM-4): the binary ADMIN role is split into SUPERADMIN
 * (cross-org) and ORG_ADMIN (own-org). Legacy `ADMIN` is retained as a
 * backward-compatible alias mapped to SUPERADMIN so no currently-provisioned
 * admin loses access (zero-regression migration mapping).
 *
 * Capability matrix (see docs / story 62.2 Task 3):
 *   Capability                              ORG_ADMIN   SUPERADMIN (=legacy ADMIN)
 *   Own-org users/facilities/patients CRUD     ✓            ✓
 *   Own-org audit read/export                  ✓            ✓
 *   Full FHIR resource-type access             ✓            ✓
 *   Create ORG_ADMIN/SUPERADMIN accounts       ✗            ✓
 *   Patient merge / unmerge (cross-patient)    ✗            ✓
 *   Cross-org operations                       ✗            ✓
 *
 * ADMIN_ROLES = every variant that behaves as "an administrator" for the purpose
 * of resource-type access and the roleRestrictedProcedure bypass — this preserves
 * the exact access every current ADMIN had.
 */
export const SUPERADMIN_ROLES: ReadonlySet<string> = new Set([
  'ADMIN', // legacy alias → treated as SUPERADMIN (zero-regression)
  'SUPERADMIN',
  'PLATFORM_ADMIN',
])

export const ORG_ADMIN_ROLES: ReadonlySet<string> = new Set([
  'ORG_ADMIN',
])

/** All roles that behave as an administrator (org-admin OR super-admin). */
export const ADMIN_ROLES: ReadonlySet<string> = new Set([
  ...SUPERADMIN_ROLES,
  ...ORG_ADMIN_ROLES,
])

/**
 * True when the role may perform CROSS-ORG operations: patient merge/unmerge,
 * creating admin accounts, and any org-boundary-crossing action. Legacy ADMIN
 * and PLATFORM_ADMIN are super-admins for backward compatibility.
 */
export function isSuperAdmin(role: string | null | undefined): boolean {
  return !!role && SUPERADMIN_ROLES.has(role)
}

/**
 * True when the role behaves as an administrator at all (own-org admin OR
 * super-admin). Use this where the current code checks `role === 'ADMIN'` for
 * an ORG-SCOPED capability that ORG_ADMIN should retain.
 */
export function isAdminRole(role: string | null | undefined): boolean {
  return !!role && ADMIN_ROLES.has(role)
}

export const ROLE_PERMISSIONS: Record<string, Set<string>> = {
  DOCTOR: CLINICIAN_RESOURCES,
  CLINICIAN: CLINICIAN_RESOURCES,
  PHARMACIST: new Set([
    'MedicationRequest',
    'MedicationDispense',
    'WholesaleCustomer',
    'SalesOrder',
    'CustomerLedgerEntry',
    'ContractPrice',
    'Supplier',
    'PurchaseOrder',
    'GoodsReceipt',
    'StockBatch',
    'StockMovement',
    'StockTransfer',
    'StockCount',
    // POS PHI types — org-scoped with field-level encryption
    'Invoice',
    'Payment',
    'LedgerEntry',
  ]),
  PATIENT: new Set([
    'Patient',
    'Consent',
    'MedicationStatement',
    'GuardianLink',
  ]),
  GUARDIAN: new Set([
    'Patient',
    'Consent',
    'MedicationStatement',
    'GuardianLink',
  ]),
  // Product decision 2026-09-28: at this stage lab-lite users get FULL, unrestricted
  // access to all patient data + results — no role-based gating, no data minimization.
  // Role-based access control will be layered on later. Previously limited to
  // ['DiagnosticReport', 'Observation']; widened to '*' so the lab uses the exact same
  // full patient workflow (create/read/update/photo/vitals/allergies) as every other app.
  LAB_TECH: new Set(['*']),
  ADMIN: new Set(['*']),
  // Story 62.2: both admin variants retain full FHIR resource-type access. The
  // difference between them is enforced at the PROCEDURE level (cross-org gates
  // via superAdminProcedure / isSuperAdmin), not at the resource-type level.
  SUPERADMIN: new Set(['*']),
  ORG_ADMIN: new Set(['*']),
  SYSTEM: new Set(['*']),
}

/**
 * Checks if a role has access to a given FHIR resource type.
 */
export function hasResourceAccess(role: string, resourceType: string): boolean {
  const permissions = ROLE_PERMISSIONS[role]
  if (!permissions) return false
  return permissions.has('*') || permissions.has(resourceType)
}

/**
 * Creates a role-restricted procedure that requires the user to have one of the specified roles.
 * ADMIN always has access. Builds on protectedProcedure (requires auth first).
 *
 * Developer Guardrails:
 * - Fail-Safe: empty/unknown role → FORBIDDEN (No Access default)
 * - Consistency: same RBAC logic applied via this single factory
 */
export function roleRestrictedProcedure(allowedRoles: string[]) {
  return protectedProcedure.use(async (opts) => {
    const userRole = opts.ctx.user.role

    // Admin bypass — every administrator variant (legacy ADMIN, SUPERADMIN,
    // ORG_ADMIN, PLATFORM_ADMIN) keeps full access. Story 62.2 preserves the
    // prior ADMIN bypass for all admin roles; cross-org restrictions are applied
    // at the procedure level, not here.
    if (isAdminRole(userRole)) {
      return opts.next({ ctx: opts.ctx })
    }

    // Check if user's role is in the allowed list
    if (!userRole || !allowedRoles.includes(userRole)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Access denied — insufficient role permissions',
      })
    }

    return opts.next({ ctx: opts.ctx })
  })
}

/**
 * Story 62.2 (M-ADM-4): a procedure gate that requires SUPER-ADMIN (cross-org)
 * privileges. Use for cross-org operations: patient merge/unmerge, creating
 * admin accounts, cross-org reads. ORG_ADMIN is rejected. Legacy ADMIN and
 * PLATFORM_ADMIN pass (backward-compatible super-admin mapping).
 */
export const superAdminProcedure = protectedProcedure.use(async (opts) => {
  if (!isSuperAdmin(opts.ctx.user.role)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied — super-admin (cross-org) privileges required',
    })
  }
  return opts.next({ ctx: opts.ctx })
})

/**
 * Lab context extracted from practitioner record for lab-scoped endpoints.
 * Data minimization: contains ONLY technician identity and lab affiliation — no patient data.
 */
export interface LabContext {
  technicianId: string
  labId: string
  labStatus: LabStatus
  /** Lab sub-role within LAB_TECH umbrella. Story 42.1. */
  labRole: LabRole
}

/**
 * Lab-scoped procedure for lab technician endpoints.
 * Requires LAB_TECH role and enriches context with technicianId and labId
 * by querying the practitioner's lab affiliation from the database.
 *
 * Story 12.1 AC 2, 3: Validates LAB_TECH role and includes lab context.
 */
export const labRestrictedProcedure = protectedProcedure.use(async (opts) => {
  const userRole = opts.ctx.user.role

  // Admin bypass — no lab context injected; downstream endpoints
  // check ctx.lab existence to scope queries or return all results.
  // Carry an explicit `lab: undefined` so both branches produce the same
  // context shape ({ lab?: LabContext }); otherwise tRPC infers `lab` as
  // `never` at the call sites. Story 62.2: all admin variants keep the bypass.
  if (isAdminRole(userRole)) {
    return opts.next({ ctx: { ...opts.ctx, lab: undefined as LabContext | undefined } })
  }

  if (userRole !== 'LAB_TECH') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied — LAB_TECH role required',
    })
  }

  // Resolve lab affiliation from the labs/lab_technicians tables.
  //
  // IMPORTANT: `lab_technicians.practitioner_id` is the practitioner PK
  // (`practitioners.id`), which is NOT the auth user id. `ctx.user.sub` is the
  // auth user id (JWT sub). The two are linked by `practitioners.auth_user_id`,
  // so we must filter through the joined practitioner — matching on
  // `practitioner_id` directly finds nothing and 403s every real technician.
  const { data: technicianRecord, error } = await opts.ctx.supabase
    .from('lab_technicians')
    .select('id, lab_id, lab_role, labs!inner(id, status), practitioners!inner(auth_user_id)')
    .eq('practitioners.auth_user_id', opts.ctx.user.sub)
    .single()

  if (error || !technicianRecord) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'No lab affiliation found for this technician',
    })
  }

  const labRecord = technicianRecord.labs as unknown as { id: string; status: string }

  return opts.next({
    ctx: {
      ...opts.ctx,
      lab: {
        technicianId: technicianRecord.id,
        labId: technicianRecord.lab_id,
        labStatus: labRecord.status as LabStatus,
        labRole: (technicianRecord.lab_role ?? 'LAB_TECH') as LabRole,
      } satisfies LabContext,
    },
  })
})
