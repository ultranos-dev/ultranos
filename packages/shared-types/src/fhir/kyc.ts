import type { KycStatus } from '../enums.js'

/**
 * OCR-extracted field from a KYC document.
 * Populated by Cloud Vision during Story 22.5 submission flow.
 */
export interface KycOcrField {
  name: string
  value: string
  confidence: number
}

/**
 * A document attached to a KYC submission.
 * Each submission may contain up to 2 documents (Medical License + National ID).
 */
export interface KycDocument {
  type: 'MEDICAL_LICENSE' | 'NATIONAL_ID'
  storageKey: string
  ocrResults: {
    fields: KycOcrField[]
  }
}

/**
 * KYC submission status — tracks the lifecycle of a single submission attempt.
 * Distinct from `KycStatus` (practitioner-level) — a practitioner may have
 * multiple submission attempts, each with its own status.
 */
export type KycSubmissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'AWAITING_INFO'

/**
 * KYC submission record.
 * Represents a single KYC verification attempt by a provider.
 * Stored in the `kyc_submissions` table (append-only — previous submissions preserved).
 */
export interface KycSubmission {
  id: string
  practitionerId: string
  submittedAt: string
  status: KycSubmissionStatus
  documents: KycDocument[]
  registryNumber: string
  registryVerificationStatus?: string
  rejectionReason?: string | null
  adminMessage?: string | null
  reviewedBy?: string | null
  reviewedAt?: string | null
}

/**
 * KYC queue entry — lightweight projection for the admin queue list view.
 * Includes computed SLA fields not stored in the database.
 */
export interface KycQueueEntry {
  submissionId: string
  practitionerId: string
  providerName: string
  submittedAt: string
  registryNumber: string
  registryVerificationStatus: string | null
  kycStatus: KycStatus | string
  slaDeadline: string
  slaBreached: boolean
  slaRemainingHours: number | null
}

/**
 * KYC submission detail — full view for the admin detail page.
 * Includes OCR fields and document URLs for side-by-side verification.
 */
export interface KycSubmissionDetail {
  submission: KycSubmission
  providerName: string
  documentUrls: Array<{
    type: 'MEDICAL_LICENSE' | 'NATIONAL_ID'
    url: string
  }>
  ocrFields: Array<{
    documentType: 'MEDICAL_LICENSE' | 'NATIONAL_ID'
    fields: KycOcrField[]
  }>
}
