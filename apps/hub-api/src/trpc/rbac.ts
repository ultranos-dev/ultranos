import { TRPCError } from '@trpc/server'
import { protectedProcedure } from './init'

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
  'ClinicalImpression',
  'DiagnosticReport',
  'Consent',
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
  ]),
  GUARDIAN: new Set([
    'Patient',
    'Consent',
    'MedicationStatement',
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
