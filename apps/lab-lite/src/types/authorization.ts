/**
 * Story 42.5 — Authorization Workflow Type Definitions
 * Task 2: TypeScript interfaces for the lab result authorization workflow.
 */
import type { LabRole } from '@ultranos/shared-types'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum AuthorizationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  HELD = 'HELD',
  AUTO_VERIFIED = 'AUTO_VERIFIED',
}

export enum AuthorizationActionType {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  HOLD = 'HOLD',
  AUTO_VERIFY = 'AUTO_VERIFY',
}

/** Aligns with Story 42.4 flag output from LabObservation. */
export type AbnormalityFlag = 'L' | 'H' | 'LL' | 'HH'

export type QcStatus = 'passing' | 'failing'

export type AuthSyncStatus = 'local' | 'syncing' | 'synced'

// ---------------------------------------------------------------------------
// Auto-Verification
// ---------------------------------------------------------------------------

export interface AutoVerifyCriteria {
  noAbnormalFlags: boolean
  qcPassing: boolean
  roleEligible: boolean
  noCriticalValues: boolean
}

export type AutoVerifyReason =
  | 'ALL_CRITERIA_MET'
  | 'CRITERIA_NOT_MET'
  | 'CRITICAL_VALUE_PRESENT'

export interface AutoVerifyEvaluation {
  eligible: boolean
  reason: AutoVerifyReason
  criteria: AutoVerifyCriteria
}

// ---------------------------------------------------------------------------
// Core data types
// ---------------------------------------------------------------------------

/**
 * Extended LabResult record with authorization fields.
 * Stored in Dexie lab_results table (v22 extension).
 * Data minimization: only patientFirstName + patientAge (CLAUDE.md Rule #7).
 */
export interface LabResultForAuthorization {
  id: string
  serviceRequestId: string
  patientRef: string            // opaque Patient/{uuid}
  patientFirstName: string      // ONLY first name (CLAUDE.md Rule #7)
  patientAge: number            // computed age, NOT DOB
  testCategory: string
  loincCode: string
  templateVersion: string
  abnormalityFlags: AbnormalityFlag[]
  qcStatus: QcStatus
  enteredBy: string             // practitioner ID
  enteredByRole: string         // LabRole string
  enteredAt: string             // HLC timestamp
  authorizationStatus: AuthorizationStatus
  authorizedBy?: string
  authorizedAt?: string
  rejectionComments?: string
  holdComments?: string
  autoVerifyEvaluation?: AutoVerifyEvaluation
  releasedAt?: string
  syncStatus: AuthSyncStatus
}

/**
 * Minimal shape needed to evaluate authorization permissions.
 * Used by canAuthorize() to avoid needing the full record.
 */
export interface AuthorizableResult {
  id: string
  enteredBy: string
  abnormalityFlags: AbnormalityFlag[]
}

/**
 * Authorization action record — full audit trail stored in Dexie.
 * This table is append-only; records are never updated.
 */
export interface AuthorizationAction {
  id?: number                   // Dexie auto-increment
  resultId: string
  action: AuthorizationActionType
  actorId: string
  actorRole: LabRole
  timestamp: string             // HLC timestamp
  comments?: string
  criticalValueAcknowledged?: boolean
  autoVerifyCriteria?: AutoVerifyCriteria
  syncStatus: AuthSyncStatus
}

/**
 * View model for the authorization queue UI row.
 * Minimal PHI — only first name + age (CLAUDE.md Rule #7).
 */
export interface AuthorizationQueueItem {
  resultId: string
  patientRef: string
  patientFirstName: string
  patientAge: number
  testCategory: string
  loincCode: string
  enteredByName: string         // display name, not ID
  enteredAt: string             // HLC timestamp
  abnormalityFlags: AbnormalityFlag[]
  urgency: 'routine' | 'urgent' | 'asap' | 'stat'
  isCritical: boolean           // true if any LL or HH flag present
}
