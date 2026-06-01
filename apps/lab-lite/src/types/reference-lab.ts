/**
 * Reference Lab types — External Reference Lab Integration
 * Story 54.4 / Task 1.1
 *
 * ReferenceLab maps to FHIR R4 Organization resource (reference lab context).
 * SendOut tracks the full lifecycle of a sample sent to an external lab.
 * Data minimization: referral forms contain ONLY first name + age (CLAUDE.md Rule #7).
 */

export type SendOutStatus =
  | 'sent'
  | 'received'
  | 'processing'
  | 'results-available'
  | 'cancelled'

/** Legal forward-only transitions. Cancelled is allowed from any state. */
export const SENDOUT_ALLOWED_TRANSITIONS: Record<
  SendOutStatus,
  SendOutStatus[]
> = {
  sent: ['received', 'cancelled'],
  received: ['processing', 'cancelled'],
  processing: ['results-available', 'cancelled'],
  'results-available': ['cancelled'],
  cancelled: [],
}

/**
 * A configured reference laboratory that can receive send-outs.
 * Maps loosely to FHIR R4 Organization with lab-specific extensions.
 */
export interface ReferenceLab {
  /** UUID */
  id: string
  name: string
  accreditationNumber: string
  address: string
  contactPhone?: string
  contactEmail?: string
  /** LOINC codes of tests this lab supports */
  supportedTests: string[]
  /**
   * Average turnaround time in days per LOINC test code.
   * Key: LOINC code, value: expected days.
   */
  averageTATDays: Record<string, number>
  isActive: boolean
  /** FHIR R4 Meta fields */
  meta: {
    lastUpdated: string
    versionId: string
  }
  /** Ultranos extension namespace */
  _ultranos: {
    createdAt: string
    hlcTimestamp: string
  }
}

/** Input type for creating a new reference lab. */
export interface CreateRefLabInput {
  name: string
  accreditationNumber: string
  address: string
  contactPhone?: string
  contactEmail?: string
  supportedTests: string[]
  averageTATDays: Record<string, number>
}

/**
 * A send-out record tracking a sample dispatched to a reference lab.
 * Referral form contains ONLY patient first name + age — data minimization (CLAUDE.md Rule #7).
 */
export interface SendOut {
  /** UUID */
  id: string
  /** FK to FhirSpecimen.id */
  sampleId: string
  /** FK to ReferenceLab.id */
  referenceLabId: string
  testRequested: {
    loincCode: string
    loincDisplay: string
  }
  /**
   * Short clinical context for the referral form.
   * Example: "suspected TB, follow-up after treatment"
   * NEVER include diagnosis codes, full history, or additional demographics.
   */
  clinicalContext: string
  status: SendOutStatus
  /** HLC-serialized timestamp — when the sample was dispatched */
  sentAt: string
  receivedAt: string | null
  processingStartedAt: string | null
  resultsAvailableAt: string | null
  cancelledAt: string | null
  shippingManifestId: string | null
  referralFormId: string | null
  /** FK to lab_results entry once result is imported */
  resultId: string | null
  /** FHIR R4 Meta */
  meta: {
    lastUpdated: string
    versionId: string
  }
  _ultranos: {
    createdAt: string
    hlcTimestamp: string
  }
}

/** Input type for creating a send-out. */
export interface CreateSendOutInput {
  sampleId: string
  referenceLabId: string
  testRequested: {
    loincCode: string
    loincDisplay: string
  }
  clinicalContext: string
}

/**
 * An individual status transition in a send-out's pipeline.
 * Append-only — never updated after creation.
 */
export interface SendOutStatusTransition {
  id: string
  sendOutId: string
  fromStatus: SendOutStatus
  toStatus: SendOutStatus
  timestamp: string
  updatedBy: string
  /** 'manual' = entered by tech; 'import' = structured data import */
  source: 'manual' | 'import'
  notes?: string
}

/**
 * A data-minimized referral form sent to the reference lab.
 * Contains ONLY: patient first name + age, sample type, test requested,
 * clinical context, originating lab info. NO other demographics or PHI.
 */
export interface ReferralForm {
  id: string
  sendOutId: string
  /** Data-minimized patient info — first name + age ONLY (CLAUDE.md Rule #7) */
  patientFirstName: string
  patientAge: number
  sampleType: string
  testRequested: {
    loincCode: string
    loincDisplay: string
  }
  clinicalContext: string
  /** Attribution: who is sending and who is receiving */
  originatingLabName: string
  referenceLabName: string
  referenceLabAccreditationNumber: string
  dateSent: string
}

/**
 * A shipping manifest grouping one or more send-outs to the same reference lab.
 */
export interface ShippingManifest {
  id: string
  referenceLabId: string
  referenceLabName: string
  sendOutIds: string[]
  /** Summary row per send-out: sampleId + test requested */
  items: Array<{
    sendOutId: string
    sampleId: string
    loincCode: string
    loincDisplay: string
  }>
  createdAt: string
}

/**
 * TAT calculation result for a single pending send-out.
 */
export interface SendOutTATStatus {
  sendOutId: string
  elapsedDays: number
  expectedDays: number
  isOverdue: boolean
  overdueByDays: number
}
