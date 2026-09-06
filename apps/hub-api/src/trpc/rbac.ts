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
  'Consent',
  'AllergyIntolerance',
])

export const ROLE_PERMISSIONS: Record<string, Set<string>> = {
  DOCTOR: CLINICIAN_RESOURCES,
  CLINICIAN: CLINICIAN_RESOURCES,
  PHARMACIST: new Set([
    'MedicationRequest',
    'MedicationDispense',
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
  LAB_TECH: new Set([
    'DiagnosticReport',
    'Observation',
  ]),
  ADMIN: new Set(['*']),
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

    // ADMIN bypass — full access to all resources
    if (userRole === 'ADMIN') {
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

  // ADMIN bypass — no lab context injected; downstream endpoints
  // check ctx.lab existence to scope queries or return all results.
  if (userRole === 'ADMIN') {
    return opts.next({ ctx: opts.ctx })
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
