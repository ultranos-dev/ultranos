/**
 * Verification Service — Story 43.4: Patient ID Verification Logging
 *
 * Creates, validates, and persists patient identity verification records.
 * Called as a PRE-CONDITION of sample accessioning (must occur before accessionSample).
 *
 * PHI rules (CLAUDE.md Rule #7):
 *  - Records store the METHOD, not the data (no ID number, no patient name, no QR payload).
 *  - patientRef is opaque Patient/<uuid> — never a name or demographic.
 *  - Audit metadata contains only opaque IDs and method enums.
 *
 * WHO Patient Identification: minimum 2 identifiers required.
 * Override with single identifier requires a written deviation reason (min 10 chars).
 */


import { PatientVerificationMethod } from '@ultranos/shared-types'
import type { PatientVerificationRecord } from '@ultranos/shared-types'
import { hlc, serializeHlc } from './hlc'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Returns true if the method count meets the WHO two-identifier minimum. */
export function isVerificationComplete(methods: PatientVerificationMethod[]): boolean {
  return methods.length >= 2
}

export interface ValidationResult {
  isComplete: boolean
  canProceed: boolean
  error?: string
}

/**
 * Validate a set of verification methods and an optional deviation reason.
 * Rules:
 *  - 0 methods → blocked
 *  - 1 method + no deviation reason (or <10 chars) → blocked with deviation required message
 *  - 1 method + valid deviation reason (>=10 chars) → allowed but logged as INCOMPLETE
 *  - 2+ methods → allowed, logged as complete
 */
export function validateVerification(
  methods: PatientVerificationMethod[],
  deviationReason?: string,
): ValidationResult {
  if (methods.length === 0) {
    return {
      isComplete: false,
      canProceed: false,
      error: 'At least one identification method is required',
    }
  }

  if (methods.length >= 2) {
    return { isComplete: true, canProceed: true }
  }

  // Exactly one method — deviation required
  const trimmedReason = (deviationReason ?? '').trim()
  if (trimmedReason.length >= 10) {
    return {
      isComplete: false,
      canProceed: true,
    }
  }

  return {
    isComplete: false,
    canProceed: false,
    error:
      'Single-identifier override requires a deviation reason of at least 10 characters',
  }
}

// ---------------------------------------------------------------------------
// Record construction
// ---------------------------------------------------------------------------

export interface CreateVerificationInput {
  sampleId: string
  patientRef: string
  methods: PatientVerificationMethod[]
  otherDescription?: string
  verifiedBy: string
  deviationReason?: string
}

/**
 * Build a PatientVerificationRecord in memory.
 * Does NOT persist to Dexie — call saveVerificationRecord() separately.
 * Caller must validate first with validateVerification() before calling this.
 */
export function createVerificationRecord(
  input: CreateVerificationInput,
): PatientVerificationRecord {
  const now = new Date().toISOString()
  const isComplete = isVerificationComplete(input.methods)

  return {
    id: crypto.randomUUID(),
    sampleId: input.sampleId,
    patientRef: input.patientRef,
    methods: [...input.methods],
    ...(input.otherDescription ? { otherDescription: input.otherDescription } : {}),
    verifiedBy: input.verifiedBy,
    verifiedAt: now,
    hlcTimestamp: serializeHlc(hlc.now()),
    isComplete,
    ...(input.deviationReason ? { deviationReason: input.deviationReason } : {}),
    syncStatus: 'pending',
  }
}

// ---------------------------------------------------------------------------
// Audit metadata
// ---------------------------------------------------------------------------

export interface VerificationAuditMetadata {
  sampleId: string
  methodsUsed: PatientVerificationMethod[]
  isComplete: boolean
  verifiedBy: string
  deviationReason?: string
  overrideAcknowledged?: boolean
}

/**
 * Build audit event metadata for a PATIENT_IDENTITY_VERIFIED event.
 * NEVER includes patient name, full ID number, or QR payload (CLAUDE.md Rule #7).
 */
export function buildAuditMetadata(input: {
  sampleId: string
  methods: PatientVerificationMethod[]
  isComplete: boolean
  verifiedBy: string
  deviationReason?: string
}): VerificationAuditMetadata {
  const meta: VerificationAuditMetadata = {
    sampleId: input.sampleId,
    methodsUsed: [...input.methods],
    isComplete: input.isComplete,
    verifiedBy: input.verifiedBy,
  }

  if (!input.isComplete && input.deviationReason) {
    meta.deviationReason = input.deviationReason
    meta.overrideAcknowledged = true
  }

  return meta
}

// ---------------------------------------------------------------------------
// QR code auto-population
// ---------------------------------------------------------------------------

export type PatientLookupSource = 'qr' | 'national_id' | 'manual'

/**
 * Returns the default pre-selected methods based on how the patient was originally
 * looked up. If patient was found via QR scan, auto-checks QR_CODE method.
 * The technician must still select a second identifier manually.
 */
export function getDefaultMethodsForSource(
  source: PatientLookupSource,
): PatientVerificationMethod[] {
  if (source === 'qr') {
    return [PatientVerificationMethod.QR_CODE]
  }
  return []
}
