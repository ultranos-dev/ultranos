/**
 * Certification Pathway Tracker types — Story 46.6
 *
 * No PHI: all records reference technicianId (opaque practitioner ID) and
 * milestone/pathway metadata only. Patient data never appears here.
 */

// ---------------------------------------------------------------------------
// Pathway & Milestone definitions (synced from Hub, stored in Dexie)
// ---------------------------------------------------------------------------

export type MilestoneCategory =
  | 'modules'
  | 'competency'
  | 'supervised_procedures'
  | 'education_hours'
  | 'mentorship'

export type MilestoneRequirementType = 'count' | 'hours' | 'streak_days' | 'all_green'

export interface MilestoneRequirement {
  type: MilestoneRequirementType
  target: number
  /** LOINC codes — when milestone is procedure-specific */
  procedureFilter?: string[]
}

export interface CertificationMilestone {
  id: string
  pathwayId: string
  name: string
  description: string
  category: MilestoneCategory
  requirement: MilestoneRequirement
  /** Display order within the pathway */
  order: number
}

export interface CertificationPathway {
  id: string
  name: string
  description: string
  milestones: CertificationMilestone[]
  /** Optional — ties pathway to a specific country/region */
  jurisdictionCode?: string
  version: string
  meta: {
    lastUpdated: string   // ISO 8601 instant (FHIR canonical)
    versionId: string
  }
}

// ---------------------------------------------------------------------------
// Per-technician progress tracking
// ---------------------------------------------------------------------------

export interface MilestoneProgress {
  milestoneId: string
  currentValue: number
  targetValue: number
  /** ISO 8601 timestamp when this milestone was first completed */
  completedAt?: string
}

export interface TechnicianProgress {
  id: string
  technicianId: string
  pathwayId: string
  milestoneProgress: MilestoneProgress[]
  overallPercent: number
  /** Name of the highest completed milestone group, or null if none */
  currentLevel: string | null
  updatedAt: string
  syncStatus: 'pending' | 'synced'
}

// ---------------------------------------------------------------------------
// Digital certificates
// ---------------------------------------------------------------------------

export interface DigitalCertificate {
  id: string
  technicianId: string
  technicianName: string
  pathwayId: string
  milestoneName: string
  issuedAt: string
  /** Unique code for QR verification — maps to Hub certificate registry */
  verificationCode: string
  /** Generated PDF stored locally as Blob — not synced to Hub */
  pdfBlob?: Blob
  syncStatus: 'pending' | 'synced'
}

// ---------------------------------------------------------------------------
// QR payload (embedded in certificate QR code — no PHI)
// ---------------------------------------------------------------------------

export interface CertificateQrPayload {
  certId: string
  techId: string
  milestone: string
  issuedAt: string
  verificationCode: string
}
