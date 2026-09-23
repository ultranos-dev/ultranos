import { describe, it, expect, beforeEach, vi } from 'vitest'

// ============================================================
// Story 61.1 (M-PHARM-4) — pharmacy PHI audit gaps closed.
// Asserts patient registration + local patient search emit auditPhiAccess
// (the CLAUDE.md testing rule: every PHI access emits an audit event).
// ============================================================

const {
  mockPatientsPut,
  mockPatientsToArray,
  mockIsReady,
  mockEnqueue,
  mockSession,
} = vi.hoisted(() => ({
  mockPatientsPut: vi.fn().mockResolvedValue(undefined),
  mockPatientsToArray: vi.fn().mockResolvedValue([]),
  mockIsReady: vi.fn().mockReturnValue(true),
  mockEnqueue: vi.fn().mockResolvedValue(undefined),
  mockSession: { userId: 'pharm-user-1' },
}))

vi.mock('@/lib/db', () => ({
  db: {
    patients: {
      put: mockPatientsPut,
      toArray: mockPatientsToArray,
    },
  },
}))

vi.mock('@/lib/dexie-sync-adapter', () => ({
  enqueuePharmacySyncEntry: mockEnqueue,
}))

vi.mock('@/lib/encryption-key-store', () => ({
  encryptionKeyStore: { isReady: mockIsReady },
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ session: mockSession }),
  },
}))

vi.mock('@/lib/audit', () => ({
  auditPhiAccess: vi.fn(),
  AuditAction: { READ: 'READ', CREATE: 'CREATE', UPDATE: 'UPDATE' },
  AuditResourceType: { PATIENT: 'PATIENT' },
}))

import { registerPatientLocally } from '@/lib/patient-register'
import { searchPatientsLocal } from '@/lib/patient-search'
import { auditPhiAccess } from '@/lib/audit'

describe('pharmacy patient PHI audit emission (M-PHARM-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsReady.mockReturnValue(true)
  })

  it('registerPatientLocally emits a PATIENT CREATE audit event with opaque IDs only', async () => {
    const patient = await registerPatientLocally({
      nameGiven: 'Ahmad',
      gender: 'male',
      allergies: ['penicillin'],
    })

    expect(auditPhiAccess).toHaveBeenCalledTimes(1)
    const [actorId, action, resourceType, resourceId, patientId, metadata] =
      (auditPhiAccess as any).mock.calls[0]
    expect(actorId).toBe('pharm-user-1')
    expect(action).toBe('CREATE')
    expect(resourceType).toBe('PATIENT')
    expect(resourceId).toBe(patient.id)
    expect(patientId).toBe(patient.id)
    // No PHI (name/allergy text) in metadata — only opaque flags/counts (Rule #1).
    expect(JSON.stringify(metadata)).not.toContain('Ahmad')
    expect(JSON.stringify(metadata)).not.toContain('penicillin')
    expect(metadata).toMatchObject({ phiAccess: 'patient_register', hasAllergies: true })
  })

  it('searchPatientsLocal emits a PATIENT READ audit event when records are surfaced', async () => {
    mockPatientsToArray.mockResolvedValueOnce([
      { id: 'p1', nameGiven: 'Ahmad', phone: '0700000000' },
    ])

    const results = await searchPatientsLocal('ah')
    expect(results).toHaveLength(1)

    expect(auditPhiAccess).toHaveBeenCalledTimes(1)
    const [actorId, action, resourceType, resourceId, patientId, metadata] =
      (auditPhiAccess as any).mock.calls[0]
    expect(actorId).toBe('pharm-user-1')
    expect(action).toBe('READ')
    expect(resourceType).toBe('PATIENT')
    expect(resourceId).toBe('patient-search-local')
    expect(patientId).toBeUndefined()
    // Never the query text or matched name/phone in metadata.
    expect(JSON.stringify(metadata)).not.toContain('Ahmad')
    expect(metadata).toMatchObject({ phiAccess: 'patient_search', resultCount: 1 })
  })

  it('searchPatientsLocal does NOT emit when no records match (no PHI read occurred)', async () => {
    mockPatientsToArray.mockResolvedValueOnce([
      { id: 'p1', nameGiven: 'Zahra', phone: '0711111111' },
    ])
    const results = await searchPatientsLocal('ah')
    expect(results).toHaveLength(0)
    expect(auditPhiAccess).not.toHaveBeenCalled()
  })
})
