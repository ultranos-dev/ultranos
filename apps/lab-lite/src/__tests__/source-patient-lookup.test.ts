/**
 * Unit tests for source-patient-lookup.ts
 * Story 47.1 — Task 12.2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock @/lib/db — must be hoisted above imports that reference it
// ---------------------------------------------------------------------------

const mockSamplesTable = {
  toArray: vi.fn(),
}

const mockVerifiedPatientsTable = {
  get: vi.fn(),
}

const mockDb = {
  samples: mockSamplesTable,
  verified_patients: mockVerifiedPatientsTable,
}

vi.mock('@/lib/db', () => ({
  getDb: () => mockDb,
}))

import {
  getLastProcessedSample,
  getSourcePatientStatus,
  getSourcePatientDisplay,
} from '../lib/safety/source-patient-lookup'

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// getLastProcessedSample
// ---------------------------------------------------------------------------

describe('getLastProcessedSample', () => {
  it('returns null when samples table is empty', async () => {
    mockSamplesTable.toArray.mockResolvedValue([])
    const result = await getLastProcessedSample('tech-001')
    expect(result).toBeNull()
  })

  it('returns null when no samples match the given techId', async () => {
    mockSamplesTable.toArray.mockResolvedValue([
      {
        id: 'sample-1',
        subject: { reference: 'Patient/patient-a' },
        meta: { lastUpdated: '2026-05-01T10:00:00Z' },
        _ultranos: { accessionedBy: 'other-tech' },
      },
    ])
    const result = await getLastProcessedSample('tech-001')
    expect(result).toBeNull()
  })

  it('returns the most recently processed sample for the given tech', async () => {
    mockSamplesTable.toArray.mockResolvedValue([
      {
        id: 'sample-old',
        subject: { reference: 'Patient/patient-a' },
        meta: { lastUpdated: '2026-04-01T08:00:00Z' },
        _ultranos: { accessionedBy: 'tech-001' },
      },
      {
        id: 'sample-recent',
        subject: { reference: 'Patient/patient-b' },
        meta: { lastUpdated: '2026-05-01T12:00:00Z' },
        _ultranos: { accessionedBy: 'tech-001' },
      },
    ])
    const result = await getLastProcessedSample('tech-001')
    expect(result).not.toBeNull()
    expect(result!.sampleId).toBe('sample-recent')
    expect(result!.patientRef).toBe('Patient/patient-b')
    expect(result!.processedAt).toBe('2026-05-01T12:00:00Z')
  })

  it('returns null when samples table throws (graceful degradation)', async () => {
    mockSamplesTable.toArray.mockRejectedValue(new Error('Table not available'))
    const result = await getLastProcessedSample('tech-001')
    expect(result).toBeNull()
  })

  it('ignores samples from other technicians', async () => {
    mockSamplesTable.toArray.mockResolvedValue([
      {
        id: 'sample-1',
        subject: { reference: 'Patient/patient-a' },
        meta: { lastUpdated: '2026-05-01T10:00:00Z' },
        _ultranos: { accessionedBy: 'tech-999' },
      },
    ])
    const result = await getLastProcessedSample('tech-001')
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getSourcePatientStatus
// ---------------------------------------------------------------------------

describe('getSourcePatientStatus', () => {
  it('returns all UNKNOWN when patient is found in verified_patients', async () => {
    mockVerifiedPatientsTable.get.mockResolvedValue({
      patientId: 'Patient/abc',
      firstName: 'Ali',
      age: 35,
    })
    const status = await getSourcePatientStatus('Patient/abc')
    expect(status.hepB).toBe('UNKNOWN')
    expect(status.hiv).toBe('UNKNOWN')
    expect(status.hepC).toBe('UNKNOWN')
  })

  it('returns all UNKNOWN when patient is NOT found (precautionary principle)', async () => {
    mockVerifiedPatientsTable.get.mockResolvedValue(undefined)
    const status = await getSourcePatientStatus('Patient/xyz')
    expect(status.hepB).toBe('UNKNOWN')
    expect(status.hiv).toBe('UNKNOWN')
    expect(status.hepC).toBe('UNKNOWN')
  })

  it('returns all UNKNOWN on database error (fail-safe)', async () => {
    mockVerifiedPatientsTable.get.mockRejectedValue(new Error('DB error'))
    const status = await getSourcePatientStatus('Patient/abc')
    expect(status.hepB).toBe('UNKNOWN')
    expect(status.hiv).toBe('UNKNOWN')
    expect(status.hepC).toBe('UNKNOWN')
  })
})

// ---------------------------------------------------------------------------
// getSourcePatientDisplay
// ---------------------------------------------------------------------------

describe('getSourcePatientDisplay', () => {
  it('returns firstName and age only — never other PHI', async () => {
    mockVerifiedPatientsTable.get.mockResolvedValue({
      patientId: 'Patient/abc',
      firstName: 'Sara',
      age: 28,
    })
    const display = await getSourcePatientDisplay('Patient/abc')
    expect(display).not.toBeNull()
    expect(display!.firstName).toBe('Sara')
    expect(display!.age).toBe(28)
    expect(display!.patientRef).toBe('Patient/abc')
    // Ensure no other fields leak
    expect((display as any).lastName).toBeUndefined()
    expect((display as any).dob).toBeUndefined()
    expect((display as any).id).toBeUndefined()
  })

  it('returns null when patient not found', async () => {
    mockVerifiedPatientsTable.get.mockResolvedValue(undefined)
    const display = await getSourcePatientDisplay('Patient/xyz')
    expect(display).toBeNull()
  })

  it('returns null on database error', async () => {
    mockVerifiedPatientsTable.get.mockRejectedValue(new Error('DB error'))
    const display = await getSourcePatientDisplay('Patient/abc')
    expect(display).toBeNull()
  })

  it('handles bare UUID patientRef (without Patient/ prefix)', async () => {
    // First call with full ref returns undefined, second with bare UUID returns record
    mockVerifiedPatientsTable.get
      .mockResolvedValueOnce(undefined) // 'Patient/uuid'
      .mockResolvedValueOnce({ patientId: 'uuid-123', firstName: 'Hamid', age: 42 }) // 'uuid-123'
    const display = await getSourcePatientDisplay('Patient/uuid-123')
    expect(display).not.toBeNull()
    expect(display!.firstName).toBe('Hamid')
    expect(display!.age).toBe(42)
  })
})
