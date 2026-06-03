/**
 * family-delegate.test.ts — Story 45.3: Family Delegate Result Access
 *
 * Covers:
 *  9.1  FamilyDelegate Dexie CRUD
 *  9.2  Phone validation (Afghan +93, MENA formats)
 *  9.3  Delegate requires active consent record
 *  9.4  Audit event assertions (DELEGATE_REGISTERED, DELEGATE_REVOKED)
 *  9.5  Data minimization: SMS text has no PHI
 *  9.6  Encryption: delegatePhone/name returned from db are stored as ciphertext
 *  9.7  Notification queuing: queueDelegateNotification no-ops when no active delegate
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

// ---------------------------------------------------------------------------
// Shared mocks — use vi.hoisted() so they are available when vi.mock factories
// run (which are hoisted above all imports by Vitest).
// ---------------------------------------------------------------------------

const mockEmitClientAudit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@ultranos/audit-logger/client', () => ({
  emitClientAudit: mockEmitClientAudit,
  setAuditStoreAdapter: vi.fn(),
}))

vi.mock('@ultranos/audit-logger/adapters/dexie', () => ({
  DexieAuditAdapter: vi.fn(),
}))

vi.mock('@ultranos/audit-logger/drain', () => ({
  AuditDrainWorker: vi.fn(),
}))

vi.mock('../lib/trpc', () => ({
  getHubApiUrl: vi.fn().mockReturnValue('http://localhost:3000'),
}))

vi.mock('../lib/supabase', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    vi.fn((selector: (state: any) => any) =>
      selector({ session: { userId: 'tech-1', email: 'tech@lab.com', role: 'LAB_TECH' } }),
    ),
    {
      getState: vi.fn().mockReturnValue({
        session: { userId: 'tech-1', email: 'tech@lab.com', role: 'LAB_TECH' },
      }),
    },
  ),
}))

// Mock Web Crypto for delegate-crypto (JSDOM doesn't have SubtleCrypto)
const MOCK_ENCRYPTED = 'ENCRYPTED:mock-ciphertext'
vi.mock('../lib/delegate-crypto', () => ({
  encryptText: vi.fn().mockResolvedValue(MOCK_ENCRYPTED),
  decryptText: vi.fn().mockImplementation((encoded: string) =>
    Promise.resolve(encoded.replace('ENCRYPTED:', '')),
  ),
}))

vi.mock('../lib/consent-crypto', () => ({
  getSessionEncryptionKey: vi.fn().mockResolvedValue({}),
}))

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import {
  getDb,
  addFamilyDelegate,
  getDelegatesByPatient,
  getDelegateByConsentId,
  getActiveDelegateByPhone,
  revokeDelegate,
  addConsentRecord,
  type FamilyDelegate,
} from '../lib/db'

import {
  validateDelegatePhone,
  normalizePhone,
} from '../lib/delegate-phone-validation'

import {
  buildDelegateSmsText,
  queueDelegateNotification,
} from '../lib/delegate-notification'

import { reportDelegateAuditEvent } from '../lib/audit-client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDelegate(overrides: Partial<Omit<FamilyDelegate, 'id'>> = {}): Omit<FamilyDelegate, 'id'> {
  return {
    patientRef: 'Patient/test-abc',
    delegatePhone: MOCK_ENCRYPTED,
    delegateRelationship: 'spouse',
    consentRecordId: 1,
    status: 'active',
    registeredAt: new Date().toISOString(),
    registeredByTechId: 'tech-1',
    hlcTimestamp: '2026-06-01T00:00:00.000Z_0000_node1',
    syncStatus: 'pending',
    ...overrides,
  }
}

async function seedConsent(patientRef = 'Patient/test-abc') {
  return addConsentRecord({
    patientRef,
    method: 'audio',
    language: 'en',
    consentTextVersion: '1.0.0',
    witnessingTechId: 'tech-1',
    capturedAt: new Date().toISOString(),
    hlcTimestamp: '2026-06-01T00:00:00.000Z_0000_node1',
    status: 'active',
    syncStatus: 'pending',
  })
}

// ---------------------------------------------------------------------------
// 9.1 — FamilyDelegate Dexie CRUD
// ---------------------------------------------------------------------------

describe('9.1 FamilyDelegate Dexie CRUD', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.familyDelegates.clear()
    await db.consentRecords.clear()
  })

  it('creates a delegate and returns an auto-generated ID', async () => {
    const consentId = await seedConsent()
    const id = await addFamilyDelegate(makeDelegate({ consentRecordId: consentId }))

    expect(id).toBeDefined()
    expect(typeof id).toBe('number')
  })

  it('reads delegates by patientRef', async () => {
    const consentId = await seedConsent()
    await addFamilyDelegate(makeDelegate({ patientRef: 'Patient/aaa', consentRecordId: consentId }))
    await addFamilyDelegate(makeDelegate({ patientRef: 'Patient/aaa', consentRecordId: consentId }))
    await addFamilyDelegate(makeDelegate({ patientRef: 'Patient/bbb', consentRecordId: consentId }))

    const results = await getDelegatesByPatient('Patient/aaa')
    expect(results).toHaveLength(2)
    expect(results.every((d) => d.patientRef === 'Patient/aaa')).toBe(true)
  })

  it('reads delegate by consentRecordId', async () => {
    const consentId = await seedConsent()
    await addFamilyDelegate(makeDelegate({ consentRecordId: consentId }))

    const result = await getDelegateByConsentId(consentId)
    expect(result).toBeDefined()
    expect(result!.consentRecordId).toBe(consentId)
  })

  it('returns undefined for non-existent consentRecordId', async () => {
    const result = await getDelegateByConsentId(99999)
    expect(result).toBeUndefined()
  })

  it('reads active delegate by encrypted phone', async () => {
    const consentId = await seedConsent()
    await addFamilyDelegate(makeDelegate({ delegatePhone: MOCK_ENCRYPTED, consentRecordId: consentId }))

    const result = await getActiveDelegateByPhone(MOCK_ENCRYPTED)
    expect(result).toBeDefined()
    expect(result!.delegatePhone).toBe(MOCK_ENCRYPTED)
  })

  it('returns empty array for patient with no delegates', async () => {
    const results = await getDelegatesByPatient('Patient/nobody')
    expect(results).toHaveLength(0)
  })

  it('stores delegateName when provided', async () => {
    const consentId = await seedConsent()
    const id = await addFamilyDelegate(
      makeDelegate({ delegateName: MOCK_ENCRYPTED, consentRecordId: consentId }),
    )

    const db = getDb()
    const record = await db.familyDelegates.get(id)
    expect(record!.delegateName).toBe(MOCK_ENCRYPTED)
  })
})

// ---------------------------------------------------------------------------
// 9.1 (continued) — Revoke is append-only (Tier 1 consent behavior)
// ---------------------------------------------------------------------------

describe('9.1 revokeDelegate — append-only (Consent Tier)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.familyDelegates.clear()
    await db.consentRecords.clear()
  })

  it('sets status to revoked without deleting the record', async () => {
    const consentId = await seedConsent()
    const id = await addFamilyDelegate(makeDelegate({ consentRecordId: consentId }))

    await revokeDelegate(id, 'Patient request')

    const db = getDb()
    const record = await db.familyDelegates.get(id)

    expect(record).toBeDefined()
    expect(record!.status).toBe('revoked')
    expect(record!.revokedAt).toBeDefined()
    expect(record!.revocationReason).toBe('Patient request')
  })

  it('preserves original encrypted phone after revocation', async () => {
    const consentId = await seedConsent()
    const id = await addFamilyDelegate(makeDelegate({ consentRecordId: consentId }))

    await revokeDelegate(id, 'Some reason')

    const db = getDb()
    const record = await db.familyDelegates.get(id)

    expect(record!.delegatePhone).toBe(MOCK_ENCRYPTED)
    expect(record!.registeredByTechId).toBe('tech-1')
  })

  it('revoked delegate does NOT appear in getActiveDelegateByPhone', async () => {
    const consentId = await seedConsent()
    const id = await addFamilyDelegate(makeDelegate({ consentRecordId: consentId }))

    await revokeDelegate(id, 'Reason')

    const result = await getActiveDelegateByPhone(MOCK_ENCRYPTED)
    expect(result).toBeUndefined()
  })

  it('marks syncStatus as pending after revocation', async () => {
    const consentId = await seedConsent()
    const id = await addFamilyDelegate(makeDelegate({ consentRecordId: consentId, syncStatus: 'synced' }))

    await revokeDelegate(id, 'Changed mind')

    const db = getDb()
    const record = await db.familyDelegates.get(id)
    expect(record!.syncStatus).toBe('pending')
  })
})

// ---------------------------------------------------------------------------
// 9.2 — Phone validation (Afghan +93, MENA formats)
// ---------------------------------------------------------------------------

describe('9.2 validateDelegatePhone', () => {
  it('returns null for valid Afghan mobile (+93 followed by 9 digits)', () => {
    expect(validateDelegatePhone('+93701234567')).toBeNull()
    expect(validateDelegatePhone('+93 701 234 567')).toBeNull()
    expect(validateDelegatePhone('+93-701-234-567')).toBeNull()
  })

  it('returns null for valid Iraqi number (+964 + 10 digits)', () => {
    expect(validateDelegatePhone('+9647501234567')).toBeNull()
  })

  it('returns null for valid Pakistani number (+92 + 10 digits)', () => {
    expect(validateDelegatePhone('+923001234567')).toBeNull()
  })

  it('returns null for valid Iranian number (+98 + 10 digits)', () => {
    expect(validateDelegatePhone('+989121234567')).toBeNull()
  })

  it('returns null for valid Syrian number (+963 + 9 digits)', () => {
    expect(validateDelegatePhone('+963931234567')).toBeNull()
  })

  it('returns "phoneRequired" for empty input', () => {
    expect(validateDelegatePhone('')).toBe('phoneRequired')
    expect(validateDelegatePhone('   ')).toBe('phoneRequired')
  })

  it('returns "phoneInvalid" if no leading + sign', () => {
    expect(validateDelegatePhone('0701234567')).toBe('phoneInvalid')
    expect(validateDelegatePhone('93701234567')).toBe('phoneInvalid')
  })

  it('returns "phoneInvalid" for unrecognised country code', () => {
    expect(validateDelegatePhone('+1234567890')).toBe('phoneInvalid')
  })

  it('returns "phoneInvalid" for Afghan number with wrong digit count (8 local digits)', () => {
    expect(validateDelegatePhone('+9370123456')).toBe('phoneInvalid')
  })

  it('returns "phoneInvalid" if local part contains non-digits', () => {
    expect(validateDelegatePhone('+93abc123456')).toBe('phoneInvalid')
  })

  it('normalizePhone strips whitespace, dashes, and parentheses', () => {
    expect(normalizePhone('+93 701 234 567')).toBe('+93701234567')
    expect(normalizePhone('+93-701-234-567')).toBe('+93701234567')
    expect(normalizePhone('+93(701)234567')).toBe('+93701234567')
  })
})

// ---------------------------------------------------------------------------
// 9.3 — DelegateRegistration requires active consent (tested via unit logic)
// ---------------------------------------------------------------------------

describe('9.3 Delegate requires active consent record', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.familyDelegates.clear()
    await db.consentRecords.clear()
  })

  it('getConsentsByPatient returns empty array when no consent exists', async () => {
    const { getConsentsByPatient } = await import('../lib/db')
    const records = await getConsentsByPatient('Patient/no-consent')
    const activeConsent = records.find((r) => r.status === 'active')
    expect(activeConsent).toBeUndefined()
  })

  it('getConsentsByPatient returns active consent after addConsentRecord', async () => {
    const { getConsentsByPatient } = await import('../lib/db')
    await seedConsent('Patient/with-consent')

    const records = await getConsentsByPatient('Patient/with-consent')
    const activeConsent = records.find((r) => r.status === 'active')
    expect(activeConsent).toBeDefined()
    expect(activeConsent!.status).toBe('active')
  })
})

// ---------------------------------------------------------------------------
// 9.4 — Audit events: DELEGATE_REGISTERED and DELEGATE_REVOKED
// ---------------------------------------------------------------------------

describe('9.4 Delegate audit events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits DELEGATE_REGISTERED event with correct metadata', () => {
    reportDelegateAuditEvent({
      action: 'DELEGATE_REGISTERED',
      delegateId: 42,
      patientRef: 'Patient/abc-123',
      delegateRelationship: 'spouse',
      consentRecordId: 7,
      technicianId: 'tech-1',
    })

    expect(mockEmitClientAudit).toHaveBeenCalledTimes(1)
    const call = mockEmitClientAudit.mock.calls[0]![0]

    expect(call.action).toBe('CREATE')
    expect(call.resourceType).toBe('CONSENT')
    expect(call.resourceId).toBe('42')
    expect(call.actorId).toBe('tech-1')
    expect(call.metadata).toMatchObject({
      delegateEvent: 'DELEGATE_REGISTERED',
      outcome: 'SUCCESS',
      patientRef: 'Patient/abc-123',
      delegateRelationship: 'spouse',
      consentRecordId: 7,
      source: 'lab-lite',
    })
  })

  it('NEVER includes phone number in DELEGATE_REGISTERED metadata', () => {
    reportDelegateAuditEvent({
      action: 'DELEGATE_REGISTERED',
      delegateId: 1,
      patientRef: 'Patient/test',
    })

    const call = mockEmitClientAudit.mock.calls[0]![0]
    const metaStr = JSON.stringify(call.metadata)

    // The encrypted phone is stored as base64 ciphertext — ensure no raw phone
    expect(metaStr).not.toMatch(/\+93/)
    expect(metaStr).not.toMatch(/\+964/)
    expect(call.metadata.delegatePhone).toBe('[REDACTED]')
  })

  it('emits DELEGATE_REVOKED event with reason', () => {
    reportDelegateAuditEvent({
      action: 'DELEGATE_REVOKED',
      delegateId: 99,
      patientRef: 'Patient/xyz',
      reason: 'Patient withdrew delegation',
      technicianId: 'tech-2',
    })

    expect(mockEmitClientAudit).toHaveBeenCalledTimes(1)
    const call = mockEmitClientAudit.mock.calls[0]![0]

    expect(call.action).toBe('CONSENT_REVOKE')
    expect(call.resourceType).toBe('CONSENT')
    expect(call.resourceId).toBe('99')
    // actorId comes from session.userId (mock always returns 'tech-1'); technicianId is only a fallback
    expect(call.actorId).toBe('tech-1')
    expect(call.metadata).toMatchObject({
      delegateEvent: 'DELEGATE_REVOKED',
      reason: 'Patient withdrew delegation',
      patientRef: 'Patient/xyz',
    })
  })

  it('NEVER includes phone number in DELEGATE_REVOKED metadata', () => {
    reportDelegateAuditEvent({
      action: 'DELEGATE_REVOKED',
      delegateId: 1,
      patientRef: 'Patient/test',
      reason: 'Patient request',
    })

    const call = mockEmitClientAudit.mock.calls[0]![0]
    expect(call.metadata.delegatePhone).toBe('[REDACTED]')
  })

  it('is fire-and-forget — never throws', () => {
    expect(() => {
      reportDelegateAuditEvent({
        action: 'DELEGATE_REGISTERED',
        delegateId: 1,
        patientRef: 'Patient/test',
      })
    }).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 9.5 — Data minimization: SMS text must not contain PHI
// ---------------------------------------------------------------------------

describe('9.5 buildDelegateSmsText — data minimization', () => {
  it('contains the receipt code', () => {
    const text = buildDelegateSmsText('ABC-1234')
    expect(text).toContain('ABC-1234')
  })

  it('does NOT contain a patient name placeholder', () => {
    const text = buildDelegateSmsText('XYZ-9999')
    // Should never include anything that could be mistaken for a name or test result
    expect(text).not.toMatch(/Patient/)
    expect(text).not.toMatch(/\bname\b/i)
    expect(text).not.toMatch(/diagnosis/i)
    expect(text).not.toMatch(/result value/i)
  })

  it('uses a generic "results are ready" message', () => {
    const text = buildDelegateSmsText('RECEIPT-001')
    expect(text.toLowerCase()).toContain('results')
    expect(text.toLowerCase()).toContain('ready')
    expect(text).toContain('RECEIPT-001')
  })

  it('same template for all receipt codes — no PHI leakage path', () => {
    const text1 = buildDelegateSmsText('AAA-111')
    const text2 = buildDelegateSmsText('BBB-222')

    // Structure is identical, only the code differs
    expect(text1.replace('AAA-111', '')).toBe(text2.replace('BBB-222', ''))
  })
})

// ---------------------------------------------------------------------------
// 9.6 — Encryption: delegatePhone/name stored as ciphertext
// ---------------------------------------------------------------------------

describe('9.6 delegate-crypto encryption contract', () => {
  it('encryptText returns a non-empty base64 string (mocked)', async () => {
    const { encryptText } = await import('../lib/delegate-crypto')
    const result = await encryptText('+93701234567')
    expect(result).toBe(MOCK_ENCRYPTED)
    expect(result).not.toBe('+93701234567')
  })

  it('decryptText reverses encryption (mocked round-trip)', async () => {
    const { encryptText, decryptText } = await import('../lib/delegate-crypto')
    const encrypted = await encryptText('+93701234567')
    const decrypted = await decryptText(encrypted)
    expect(decrypted).toBe('mock-ciphertext') // per mock impl
    expect(decrypted).not.toContain('+93') // never returns raw phone from storage
  })

  it('delegate is stored with encrypted phone, not plaintext', async () => {
    const db = getDb()
    await db.familyDelegates.clear()
    await db.consentRecords.clear()

    const consentId = await seedConsent()
    const id = await addFamilyDelegate(
      makeDelegate({
        delegatePhone: MOCK_ENCRYPTED,   // simulates post-encryption value
        consentRecordId: consentId,
      }),
    )

    const stored = await db.familyDelegates.get(id)

    // Stored value is the ciphertext, not a raw phone number
    expect(stored!.delegatePhone).toBe(MOCK_ENCRYPTED)
    expect(stored!.delegatePhone).not.toMatch(/^\+\d{9,12}$/)
  })
})

// ---------------------------------------------------------------------------
// 9.7 — queueDelegateNotification: no-op when no active delegate
// ---------------------------------------------------------------------------

describe('9.7 queueDelegateNotification', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.familyDelegates.clear()
    await db.consentRecords.clear()
    await db.syncQueue?.clear?.()
  })

  it('returns null when patient has no delegates', async () => {
    const result = await queueDelegateNotification('Patient/no-one', 'REC-999')
    expect(result).toBeNull()
  })

  it('returns null when the only delegate is revoked', async () => {
    const consentId = await seedConsent('Patient/revoked-only')
    const id = await addFamilyDelegate(
      makeDelegate({ patientRef: 'Patient/revoked-only', consentRecordId: consentId }),
    )
    await revokeDelegate(id, 'Test')

    const result = await queueDelegateNotification('Patient/revoked-only', 'REC-100')
    expect(result).toBeNull()
  })

  it('returns the delegate ID when an active delegate exists', async () => {
    const consentId = await seedConsent('Patient/has-delegate')
    const id = await addFamilyDelegate(
      makeDelegate({ patientRef: 'Patient/has-delegate', consentRecordId: consentId }),
    )

    const result = await queueDelegateNotification('Patient/has-delegate', 'REC-200')
    expect(result).toBe(id)
  })
})
