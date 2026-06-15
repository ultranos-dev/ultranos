/**
 * Health Record Access Control — Story 47.3 AC 3
 *
 * Access rules:
 * - Tech viewing own record:     ALLOWED (self-service)
 * - Lab manager viewing any:     ALLOWED (supervisory responsibility)
 * - Tech viewing another tech:   DENIED + audit event
 * - Any other role:              DENIED + audit event
 *
 * Enforced at the service layer, not just UI.
 */

import { LabRole } from '@ultranos/shared-types'
import { reportHealthRecordAuditEvent } from '@/lib/audit-client'

/**
 * Check if the current user can access a given practitioner's health record.
 * Emits an audit event on denial.
 */
export function canAccessHealthRecord(
  currentUserId: string,
  currentUserLabRole: LabRole | null,
  targetPractitionerId: string,
): boolean {
  // Self-access is always allowed
  if (currentUserId === targetPractitionerId) {
    return true
  }

  // Lab manager can access any record
  if (currentUserLabRole === LabRole.LAB_MANAGER) {
    return true
  }

  // All other access is denied — emit audit event
  reportHealthRecordAuditEvent({
    action: 'HEALTH_RECORD_ACCESS_DENIED',
    practitionerId: targetPractitionerId,
    accessedBy: currentUserId,
    fieldsModified: [],
  })

  return false
}

/**
 * Assert access control. Throws on denial (for use in service layer).
 */
export function assertHealthRecordAccess(
  currentUserId: string,
  currentUserLabRole: LabRole | null,
  targetPractitionerId: string,
): void {
  if (!canAccessHealthRecord(currentUserId, currentUserLabRole, targetPractitionerId)) {
    throw new Error('Unauthorized access to health record')
  }
}
