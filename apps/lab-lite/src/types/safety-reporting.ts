/**
 * Safety Reporting Types — Story 47.6
 *
 * ANONYMITY GUARANTEE: The SafetyReport interface intentionally has NO field
 * for reporter identity (no reporterId, userId, sessionId). This is a
 * technical enforcement of the anonymity design — not an oversight.
 */

export enum SafetyConcernCategory {
  HAND_HYGIENE = 'HAND_HYGIENE',
  PPE_NON_USE = 'PPE_NON_USE',
  IMPROPER_WASTE_DISPOSAL = 'IMPROPER_WASTE_DISPOSAL',
  EQUIPMENT_MISUSE = 'EQUIPMENT_MISUSE',
  OTHER = 'OTHER',
}

export enum ReportStatus {
  SUBMITTED = 'SUBMITTED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  INVESTIGATING = 'INVESTIGATING',
  CLOSED = 'CLOSED',
}

/**
 * Anonymous safety report record.
 *
 * NO reporterId, sessionId, userId, or any field that could identify the reporter.
 * submittedAt is rounded to the nearest hour to prevent time-based correlation.
 * id is a random UUIDv4 — not sequential.
 */
export interface SafetyReport {
  id: string
  category: SafetyConcernCategory
  details: string
  submittedAt: string // ISO 8601, rounded to nearest hour
  status: ReportStatus
  resolution: string | null
  acknowledgedAt: string | null
  closedAt: string | null
  investigatorNotes: string | null
}
