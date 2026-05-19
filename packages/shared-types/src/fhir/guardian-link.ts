/**
 * Guardian Link — data model for patient-initiated guardian linking.
 *
 * Story 18.7: Guardian Linking & Consent Delegation
 * PRD HP-012: "Guardian designation initiated by patient."
 *
 * The guardian link represents a trust relationship where a patient
 * delegates consent management to a guardian. The link is always
 * patient-initiated (privacy-by-design).
 *
 * V1 constraint: one primary patient per guardian.
 */

export interface GuardianLink {
  /** Unique identifier for the link */
  id: string

  /** Patient who initiated the link */
  patientId: string

  /** Supabase user ID of the guardian */
  guardianUserId: string

  /**
   * HMAC-SHA256 hash of the guardian's phone number.
   * Never stored in plaintext — same pattern as patientRef in Lab Lite.
   */
  guardianPhone: string

  /**
   * Last 4 digits of the guardian's phone number for display purposes.
   * Stored as a masked hint (e.g., "3456") — not the full number.
   */
  guardianPhoneHint: string

  /** Always 'GUARDIAN' — maps to GrantorRole.GUARDIAN */
  role: 'GUARDIAN'

  /** ISO 8601 timestamp of when the link was established */
  linkedAt: string

  /** Always 'PATIENT' — guardian linking is patient-initiated only */
  linkedBy: 'PATIENT'

  /** Current status of the guardian link */
  status: 'active' | 'revoked'

  /** ISO 8601 timestamp of when the link was revoked (if applicable) */
  revokedAt?: string
}

/** Maximum number of active guardian links per patient (V1 constraint) */
export const MAX_ACTIVE_GUARDIAN_LINKS = 1
