/**
 * Maps internal role enum values to human-readable display labels.
 * Covers all active UserRole and LabRole values from @ultranos/shared-types.
 * Case-insensitive. Returns the raw role string for any unrecognised value.
 */
export function formatUserRole(role: string): string {
  const map: Record<string, string> = {
    // UserRole enum values
    ADMIN: 'Administrator',
    DOCTOR: 'Doctor',
    PHARMACIST: 'Pharmacist',
    LAB_TECH: 'Lab Technician',
    CLINICIAN: 'Clinician',        // legacy — kept for graceful fallback
    // LabRole sub-role values
    SENIOR_TECH: 'Senior Technician',
    SUPERVISOR: 'Supervisor',
    LAB_MANAGER: 'Lab Manager',
  }
  return map[role?.toUpperCase()] ?? role
}
