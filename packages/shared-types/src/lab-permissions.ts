import { LabRole, LabPermission } from './enums.js'

/**
 * Lab role → permission matrix.
 * Story 42.1 AC 2: Defines which lab permissions each role holds.
 *
 * Uses explicit permission sets (not ordinal comparison) to allow
 * non-linear permission grants in the future.
 */
export const LAB_ROLE_PERMISSIONS: Record<LabRole, Set<LabPermission>> = {
  [LabRole.LAB_TECH]: new Set([
    LabPermission.ENTER_RESULTS,
  ]),
  [LabRole.SENIOR_TECH]: new Set([
    LabPermission.ENTER_RESULTS,
    LabPermission.RELEASE_ROUTINE_RESULTS,
  ]),
  [LabRole.SUPERVISOR]: new Set([
    LabPermission.ENTER_RESULTS,
    LabPermission.RELEASE_ROUTINE_RESULTS,
    LabPermission.RELEASE_ALL_RESULTS,
    LabPermission.OVERRIDE_QC_LOCKOUT,
    LabPermission.VIEW_STAFF,
    LabPermission.VIEW_AUDIT_LOGS,
  ]),
  [LabRole.LAB_MANAGER]: new Set([
    LabPermission.ENTER_RESULTS,
    LabPermission.RELEASE_ROUTINE_RESULTS,
    LabPermission.RELEASE_ALL_RESULTS,
    LabPermission.OVERRIDE_QC_LOCKOUT,
    LabPermission.VIEW_STAFF,
    LabPermission.MANAGE_STAFF_ROLES,
    LabPermission.VIEW_AUDIT_LOGS,
  ]),
}

/**
 * Check if a lab role has a specific permission.
 * Returns false for unknown roles.
 */
export function hasLabPermission(role: LabRole, permission: LabPermission): boolean {
  const permissions = LAB_ROLE_PERMISSIONS[role]
  if (!permissions) return false
  return permissions.has(permission)
}
