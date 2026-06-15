/**
 * Story 43.4: Patient ID Verification Logging — Unit Tests
 * Tests 7.1–7.8: verification service logic, audit metadata, QR integration.
 * PHI COMPLIANCE: No patient names or full ID numbers in any assertion.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PatientVerificationMethod } from '@ultranos/shared-types'
import {
  createVerificationRecord,
  validateVerification,
  isVerificationComplete,
  buildAuditMetadata,
  getDefaultMethodsForSource,
} from '../lib/verification-service'

// ---------------------------------------------------------------------------
// 7.1 — Verification record created with correct methods array
// ---------------------------------------------------------------------------
describe('createVerificationRecord', () => {
  it('7.1 creates a record with the supplied methods array', () => {
    const record = createVerificationRecord({
      sampleId: 'specimen-uuid-001',
      patientRef: 'Patient/patient-uuid-001',
      methods: [PatientVerificationMethod.NATIONAL_ID_SCANNED, PatientVerificationMethod.VERBAL_CONFIRMATION],
      verifiedBy: 'Practitioner/tech-001',
    })

    expect(record.methods).toEqual([
      PatientVerificationMethod.NATIONAL_ID_SCANNED,
      PatientVerificationMethod.VERBAL_CONFIRMATION,
    ])
    expect(record.id).toBeTruthy() // UUID assigned
    expect(typeof record.id).toBe('string')
  })

  it('7.1 record has hlcTimestamp and verifiedAt in ISO format', () => {
    const record = createVerificationRecord({
      sampleId: 'specimen-uuid-001',
      patientRef: 'Patient/patient-uuid-001',
      methods: [PatientVerificationMethod.QR_CODE, PatientVerificationMethod.VERBAL_CONFIRMATION],
      verifiedBy: 'Practitioner/tech-001',
    })

    expect(record.hlcTimestamp).toBeTruthy()
    expect(record.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('7.1 stores otherDescription when OTHER method is provided', () => {
    const record = createVerificationRecord({
      sampleId: 'specimen-uuid-001',
      patientRef: 'Patient/patient-uuid-001',
      methods: [PatientVerificationMethod.VERBAL_CONFIRMATION, PatientVerificationMethod.OTHER],
      otherDescription: 'Employee badge scan',
      verifiedBy: 'Practitioner/tech-001',
    })

    expect(record.otherDescription).toBe('Employee badge scan')
    expect(record.methods).toContain(PatientVerificationMethod.OTHER)
  })

  // ---------------------------------------------------------------------------
  // 7.8 — Verification record linked to sample via sampleId
  // ---------------------------------------------------------------------------
  it('7.8 links record to sample via sampleId', () => {
    const sampleId = 'specimen-uuid-abc-123'
    const record = createVerificationRecord({
      sampleId,
      patientRef: 'Patient/patient-uuid-001',
      methods: [PatientVerificationMethod.QR_CODE, PatientVerificationMethod.NATIONAL_ID_SCANNED],
      verifiedBy: 'Practitioner/tech-001',
    })

    expect(record.sampleId).toBe(sampleId)
  })
})

// ---------------------------------------------------------------------------
// 7.4 — isComplete flag correctly computed based on method count
// ---------------------------------------------------------------------------
describe('isVerificationComplete', () => {
  it('7.4 returns true when 2 or more methods are selected', () => {
    expect(
      isVerificationComplete([PatientVerificationMethod.NATIONAL_ID_SCANNED, PatientVerificationMethod.VERBAL_CONFIRMATION]),
    ).toBe(true)
  })

  it('7.4 returns true when 3 methods are selected', () => {
    expect(
      isVerificationComplete([
        PatientVerificationMethod.NATIONAL_ID_SCANNED,
        PatientVerificationMethod.VERBAL_CONFIRMATION,
        PatientVerificationMethod.QR_CODE,
      ]),
    ).toBe(true)
  })

  it('7.4 returns false for exactly 1 method', () => {
    expect(isVerificationComplete([PatientVerificationMethod.NATIONAL_ID_SCANNED])).toBe(false)
  })

  it('7.4 returns false for 0 methods', () => {
    expect(isVerificationComplete([])).toBe(false)
  })

  it('7.4 createVerificationRecord sets isComplete=true when methods.length>=2', () => {
    const record = createVerificationRecord({
      sampleId: 'specimen-uuid-001',
      patientRef: 'Patient/patient-uuid-001',
      methods: [PatientVerificationMethod.QR_CODE, PatientVerificationMethod.VERBAL_CONFIRMATION],
      verifiedBy: 'Practitioner/tech-001',
    })
    expect(record.isComplete).toBe(true)
  })

  it('7.4 createVerificationRecord sets isComplete=false when methods.length<2', () => {
    const record = createVerificationRecord({
      sampleId: 'specimen-uuid-001',
      patientRef: 'Patient/patient-uuid-001',
      methods: [PatientVerificationMethod.VERBAL_CONFIRMATION],
      verifiedBy: 'Practitioner/tech-001',
      deviationReason: 'Patient unresponsive, single identifier only',
    })
    expect(record.isComplete).toBe(false)
    expect(record.deviationReason).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 7.2 — Two-identifier minimum enforced
// ---------------------------------------------------------------------------
describe('validateVerification', () => {
  it('7.2 canProceed is true with 2 or more methods', () => {
    const result = validateVerification([
      PatientVerificationMethod.NATIONAL_ID_SCANNED,
      PatientVerificationMethod.VERBAL_CONFIRMATION,
    ])
    expect(result.canProceed).toBe(true)
    expect(result.isComplete).toBe(true)
  })

  it('7.2 canProceed is false with 0 methods', () => {
    const result = validateVerification([])
    expect(result.canProceed).toBe(false)
    expect(result.isComplete).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('7.2 canProceed is false with 1 method and no deviation reason', () => {
    const result = validateVerification([PatientVerificationMethod.VERBAL_CONFIRMATION])
    expect(result.canProceed).toBe(false)
    expect(result.isComplete).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // 7.3 — Single-identifier override requires deviation reason
  // ---------------------------------------------------------------------------
  it('7.3 canProceed is true with 1 method AND deviation reason (>=10 chars)', () => {
    const result = validateVerification(
      [PatientVerificationMethod.VERBAL_CONFIRMATION],
      'Patient refused to show ID — verbal only',
    )
    expect(result.canProceed).toBe(true)
    expect(result.isComplete).toBe(false)
  })

  it('7.3 canProceed is false with 1 method AND deviation reason <10 chars', () => {
    const result = validateVerification(
      [PatientVerificationMethod.VERBAL_CONFIRMATION],
      'Short', // less than 10 chars
    )
    expect(result.canProceed).toBe(false)
  })

  it('7.3 canProceed is false with 1 method AND empty deviation reason', () => {
    const result = validateVerification([PatientVerificationMethod.VERBAL_CONFIRMATION], '')
    expect(result.canProceed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 7.5 — PATIENT_IDENTITY_VERIFIED audit event emitted with correct metadata
// 7.6 — Audit metadata never contains PHI
// ---------------------------------------------------------------------------
describe('buildAuditMetadata', () => {
  it('7.5 includes sampleId, methodsUsed, isComplete, verifiedBy', () => {
    const meta = buildAuditMetadata({
      sampleId: 'specimen-uuid-001',
      methods: [PatientVerificationMethod.QR_CODE, PatientVerificationMethod.VERBAL_CONFIRMATION],
      isComplete: true,
      verifiedBy: 'Practitioner/tech-001',
    })

    expect(meta.sampleId).toBe('specimen-uuid-001')
    expect(meta.methodsUsed).toEqual([
      PatientVerificationMethod.QR_CODE,
      PatientVerificationMethod.VERBAL_CONFIRMATION,
    ])
    expect(meta.isComplete).toBe(true)
    expect(meta.verifiedBy).toBe('Practitioner/tech-001')
  })

  it('7.5 includes deviationReason and overrideAcknowledged when incomplete', () => {
    const meta = buildAuditMetadata({
      sampleId: 'specimen-uuid-001',
      methods: [PatientVerificationMethod.VERBAL_CONFIRMATION],
      isComplete: false,
      verifiedBy: 'Practitioner/tech-001',
      deviationReason: 'Patient refused to show ID, single identifier only',
    })

    expect(meta.isComplete).toBe(false)
    expect(meta.deviationReason).toBeTruthy()
    expect(meta.overrideAcknowledged).toBe(true)
  })

  it('7.6 audit metadata does NOT contain patient name', () => {
    const meta = buildAuditMetadata({
      sampleId: 'specimen-uuid-001',
      methods: [PatientVerificationMethod.NATIONAL_ID_SCANNED, PatientVerificationMethod.VERBAL_CONFIRMATION],
      isComplete: true,
      verifiedBy: 'Practitioner/tech-001',
    })

    const serialized = JSON.stringify(meta)
    // PHI check: no patient name-like fields
    expect(serialized).not.toMatch(/firstName|lastName|patientName|name.*patient/i)
  })

  it('7.6 audit metadata does NOT contain full ID number', () => {
    const meta = buildAuditMetadata({
      sampleId: 'specimen-uuid-001',
      methods: [PatientVerificationMethod.NATIONAL_ID_SCANNED, PatientVerificationMethod.VERBAL_CONFIRMATION],
      isComplete: true,
      verifiedBy: 'Practitioner/tech-001',
    })

    const serialized = JSON.stringify(meta)
    // PHI check: no national ID number
    expect(serialized).not.toMatch(/nationalId|idNumber|documentNumber/i)
  })
})

// ---------------------------------------------------------------------------
// 7.12 — Offline persistence: verification stored in Dexie with syncStatus pending
// ---------------------------------------------------------------------------
describe('offline persistence contract', () => {
  it('7.12 createVerificationRecord sets syncStatus to pending (offline-first)', () => {
    const record = createVerificationRecord({
      sampleId: 'specimen-uuid-offline',
      patientRef: 'Patient/patient-uuid-offline',
      methods: [PatientVerificationMethod.QR_CODE, PatientVerificationMethod.VERBAL_CONFIRMATION],
      verifiedBy: 'Practitioner/tech-offline',
    })

    expect(record.syncStatus).toBe('pending')
  })

  it('7.12 record has id, hlcTimestamp, and verifiedAt — all needed for sync ordering', () => {
    const record = createVerificationRecord({
      sampleId: 'specimen-uuid-offline',
      patientRef: 'Patient/patient-uuid-offline',
      methods: [PatientVerificationMethod.NATIONAL_ID_SCANNED, PatientVerificationMethod.VERBAL_CONFIRMATION],
      verifiedBy: 'Practitioner/tech-offline',
    })

    expect(record.id).toBeTruthy()
    expect(record.hlcTimestamp).toBeTruthy()
    expect(record.verifiedAt).toBeTruthy()
    // Verify these are all strings (serializable for Dexie + sync queue)
    expect(typeof record.id).toBe('string')
    expect(typeof record.hlcTimestamp).toBe('string')
    expect(typeof record.verifiedAt).toBe('string')
  })

  it('7.12 incomplete verification also has syncStatus pending (deviation syncs too)', () => {
    const record = createVerificationRecord({
      sampleId: 'specimen-uuid-offline',
      patientRef: 'Patient/patient-uuid-offline',
      methods: [PatientVerificationMethod.VERBAL_CONFIRMATION],
      verifiedBy: 'Practitioner/tech-offline',
      deviationReason: 'Patient refused to show ID — verbal only',
    })

    expect(record.syncStatus).toBe('pending')
    expect(record.isComplete).toBe(false)
    expect(record.deviationReason).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 7.7 — QR code method auto-populated when patient was QR-verified
// ---------------------------------------------------------------------------
describe('QR code auto-population', () => {
  it('7.7 QR_CODE is included in default methods when verificationSource is qr', () => {
    const methods = getDefaultMethodsForSource('qr')
    expect(methods).toContain(PatientVerificationMethod.QR_CODE)
  })

  it('7.7 QR_CODE is NOT included in defaults when verificationSource is manual', () => {
    const methods = getDefaultMethodsForSource('manual')
    expect(methods).not.toContain(PatientVerificationMethod.QR_CODE)
  })

  it('7.7 QR_CODE is NOT included in defaults when verificationSource is national_id', () => {
    const methods = getDefaultMethodsForSource('national_id')
    expect(methods).not.toContain(PatientVerificationMethod.QR_CODE)
  })
})
