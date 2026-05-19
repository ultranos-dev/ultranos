/**
 * Tests for Story 18.7: Guardian Linking & Consent Delegation
 *
 * Covers:
 * - Guardian data model (GuardianLink type)
 * - Guardian link flow (OTP via SMS and WhatsApp)
 * - Unlink removes guardian and revokes consents
 * - Guardian-created consents tagged with GUARDIAN role
 * - V1 limit — second guardian link attempt fails
 * - Audit events emitted for all guardian actions
 * - No PHI in audit events
 * - Hub API notification on link/unlink
 * - Guardian consent integration flow
 */
import { GrantorRole, ConsentScope, ConsentPurpose } from '@ultranos/shared-types'
import type { GuardianLink } from '@ultranos/shared-types'
import { MAX_ACTIVE_GUARDIAN_LINKS } from '@ultranos/shared-types'

// ---- Mock dependencies ----

// Mock fetch for Hub API calls
const mockFetch = jest.fn()
global.fetch = mockFetch

// Mock Supabase
const mockSignInWithOtp = jest.fn()
const mockGetSession = jest.fn().mockResolvedValue({
  data: { session: { access_token: 'test-token' } },
})
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
      getSession: () => mockGetSession(),
    },
  },
}))

// Mock encrypted-db
const mockRunAsync = jest.fn()
const mockGetFirstAsync = jest.fn()
jest.mock('@/lib/encrypted-db', () => ({
  getEncryptedDbConnection: jest.fn().mockResolvedValue({
    runAsync: (...args: unknown[]) => mockRunAsync(...args),
    getFirstAsync: (...args: unknown[]) => mockGetFirstAsync(...args),
  }),
}))

// Mock mobile-key-service (for HMAC key)
jest.mock('@/lib/mobile-key-service', () => ({
  getOrCreateDbPassphrase: jest.fn().mockResolvedValue(
    'a'.repeat(64), // 64-char hex for HMAC key
  ),
}))

// Mock consent-sync
jest.mock('@/lib/consent-sync', () => ({
  queueConsentSync: jest.fn(),
}))

// Mock audit
const mockEmitAuditEvent = jest.fn()
jest.mock('@/lib/audit', () => ({
  emitAuditEvent: (...args: unknown[]) => mockEmitAuditEvent(...args),
}))

// Mock consent-sync (already declared above but re-export for guardian-api)
// No additional navigation, profile, or i18n mocks needed — this test file
// only tests guardian-api.ts, consent-mapper.ts, and guardian-audit.ts.

// Now import the modules under test (after mocks)
import {
  initiateGuardianLink,
  confirmGuardianLink,
  unlinkGuardian,
  getActiveGuardianLink,
} from '@/data/guardian-api'
import { createConsent, withdrawConsent } from '@/lib/consent-mapper'
import { emitGuardianAudit, emitGuardianConsentAudit } from '@/lib/guardian-audit'

/** Helper: mock a successful Hub API response */
function mockHubApiSuccess(guardianUserId: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      result: { data: { json: { guardianUserId } } },
    }),
  })
}

/** Helper: mock Hub API create link / notify calls (subsequent fetches) */
function mockHubApiSideEffects() {
  // createLink call
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
}

describe('Guardian Data Model', () => {
  it('GuardianLink interface has required fields including guardianPhoneHint', () => {
    const link: GuardianLink = {
      id: 'link-1',
      patientId: 'patient-123',
      guardianUserId: 'guardian-456',
      guardianPhone: 'hashed-phone',
      guardianPhoneHint: '3456',
      role: 'GUARDIAN',
      linkedAt: '2026-05-18T10:00:00Z',
      linkedBy: 'PATIENT',
      status: 'active',
    }

    expect(link.role).toBe('GUARDIAN')
    expect(link.linkedBy).toBe('PATIENT')
    expect(link.status).toBe('active')
    expect(link.guardianPhoneHint).toBe('3456')
  })

  it('V1 limit is 1 active guardian per patient', () => {
    expect(MAX_ACTIVE_GUARDIAN_LINKS).toBe(1)
  })

  it('GuardianLink supports revoked status', () => {
    const revokedLink: GuardianLink = {
      id: 'link-2',
      patientId: 'patient-123',
      guardianUserId: 'guardian-789',
      guardianPhone: 'hashed-phone-2',
      guardianPhoneHint: '9999',
      role: 'GUARDIAN',
      linkedAt: '2026-05-18T10:00:00Z',
      linkedBy: 'PATIENT',
      status: 'revoked',
      revokedAt: '2026-05-18T12:00:00Z',
    }

    expect(revokedLink.status).toBe('revoked')
    expect(revokedLink.revokedAt).toBeDefined()
  })
})

describe('Guardian OTP Linking Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetFirstAsync.mockResolvedValue(null) // No existing guardian
  })

  it('initiateGuardianLink sends OTP via SMS to guardian phone', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })

    await initiateGuardianLink('patient-123', '+93700123456')

    expect(mockSignInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+93700123456' }),
    )
  })

  it('initiateGuardianLink sends OTP via WhatsApp when channel specified', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })

    await initiateGuardianLink('patient-123', '+93700123456', 'whatsapp')

    expect(mockSignInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '+93700123456',
        options: { channel: 'whatsapp' },
      }),
    )
  })

  it('initiateGuardianLink fails if patient already has active guardian', async () => {
    mockGetFirstAsync.mockResolvedValue({
      id: 'existing-link',
      patient_id: 'patient-123',
      guardian_user_id: 'guardian-existing',
      guardian_phone: 'hashed',
      guardian_phone_hint: '9999',
      role: 'GUARDIAN',
      linked_at: '2026-05-18T10:00:00Z',
      linked_by: 'PATIENT',
      status: 'active',
      revoked_at: null,
    })

    await expect(
      initiateGuardianLink('patient-123', '+93700999999'),
    ).rejects.toThrow('V1 limit')
  })

  it('confirmGuardianLink verifies OTP via Hub API and creates link', async () => {
    mockHubApiSuccess('guardian-456')
    mockHubApiSideEffects()
    mockRunAsync.mockResolvedValue(undefined)

    const link = await confirmGuardianLink('patient-123', '+93700123456', '123456')

    expect(link.patientId).toBe('patient-123')
    expect(link.guardianUserId).toBe('guardian-456')
    expect(link.role).toBe('GUARDIAN')
    expect(link.linkedBy).toBe('PATIENT')
    expect(link.status).toBe('active')
    // Phone is HMAC-hashed — not plaintext
    expect(link.guardianPhone).not.toBe('+93700123456')
    expect(link.guardianPhone).toHaveLength(64) // HMAC-SHA256 hex
    // Phone hint is last 4 digits
    expect(link.guardianPhoneHint).toBe('3456')
  })

  it('confirmGuardianLink passes channel to Hub API for WhatsApp verification', async () => {
    mockHubApiSuccess('guardian-456')
    mockHubApiSideEffects()
    mockRunAsync.mockResolvedValue(undefined)

    await confirmGuardianLink('patient-123', '+93700123456', '123456', 'whatsapp')

    // First fetch call is the OTP verification
    const verifyCall = mockFetch.mock.calls[0]
    const body = JSON.parse(verifyCall[1].body)
    expect(body.json.channel).toBe('whatsapp')
  })

  it('confirmGuardianLink fails on Hub API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

    await expect(
      confirmGuardianLink('patient-123', '+93700123456', '000000'),
    ).rejects.toThrow('verification failed')
  })

  it('confirmGuardianLink syncs to Hub API after local save (AC #5)', async () => {
    mockHubApiSuccess('guardian-456')
    mockHubApiSideEffects()
    mockRunAsync.mockResolvedValue(undefined)

    await confirmGuardianLink('patient-123', '+93700123456', '123456')

    // Should have made 2 fetch calls: verifyOtp + createLink
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const createLinkCall = mockFetch.mock.calls[1]
    expect(createLinkCall[0]).toContain('guardian.createLink')
  })
})

describe('Unlink Guardian', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('unlinkGuardian sets status to revoked', async () => {
    mockGetFirstAsync.mockResolvedValue({ guardian_user_id: 'guardian-456' })
    mockRunAsync.mockResolvedValue(undefined)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // notifyUnlink

    await unlinkGuardian('patient-123', 'link-1')

    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining('revoked'),
      expect.arrayContaining(['link-1', 'patient-123']),
    )
  })

  it('unlinkGuardian revokes all guardian-created consents (AC #10)', async () => {
    mockGetFirstAsync.mockResolvedValue({ guardian_user_id: 'guardian-456' })
    mockRunAsync.mockResolvedValue(undefined)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    await unlinkGuardian('patient-123', 'link-1')

    // Should have 2 runAsync calls: revoke link + revoke consents
    const consentRevocationCall = mockRunAsync.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('consents'),
    )
    expect(consentRevocationCall).toBeDefined()
    expect(consentRevocationCall![0]).toContain('withdrawn')
  })

  it('unlinkGuardian sends notification to guardian via Hub API (AC #10)', async () => {
    mockGetFirstAsync.mockResolvedValue({ guardian_user_id: 'guardian-456' })
    mockRunAsync.mockResolvedValue(undefined)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    await unlinkGuardian('patient-123', 'link-1')

    const notifyCall = mockFetch.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('guardian.notifyUnlink'),
    )
    expect(notifyCall).toBeDefined()
  })

  it('unlinkGuardian always emits audit even if link not found', async () => {
    mockGetFirstAsync.mockResolvedValue(null) // link not found
    mockRunAsync.mockResolvedValue(undefined)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    await unlinkGuardian('patient-123', 'link-1')

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'GUARDIAN_LINK_REVOKED',
      }),
    )
  })
})

describe('Guardian Consent Management', () => {
  it('consent created by guardian has GUARDIAN grantor role', async () => {
    const consent = await createConsent({
      patientId: 'patient-123',
      scope: ConsentScope.PRESCRIPTIONS,
      purpose: ConsentPurpose.TREATMENT,
      hlcTimestamp: '2026-05-18T10:00:00Z',
      grantorRole: GrantorRole.GUARDIAN,
      grantorUserId: 'guardian-456',
    })

    expect(consent._ultranos.grantorRole).toBe(GrantorRole.GUARDIAN)
    expect(consent._ultranos.grantorId).toBe('guardian-456')
  })

  it('consent withdrawn by guardian has GUARDIAN role', async () => {
    const consent = await withdrawConsent({
      patientId: 'patient-123',
      scope: ConsentScope.LABS,
      purpose: ConsentPurpose.TREATMENT,
      hlcTimestamp: '2026-05-18T10:00:00Z',
      grantorRole: GrantorRole.GUARDIAN,
      grantorUserId: 'guardian-456',
      reason: 'Guardian decision',
    })

    expect(consent._ultranos.grantorRole).toBe(GrantorRole.GUARDIAN)
    expect(consent._ultranos.grantorId).toBe('guardian-456')
    expect(consent.status).toBe('WITHDRAWN')
  })

  it('self-created consent uses patient as grantorId', async () => {
    const consent = await createConsent({
      patientId: 'patient-123',
      scope: ConsentScope.VITALS,
      purpose: ConsentPurpose.TREATMENT,
      hlcTimestamp: '2026-05-18T10:00:00Z',
      grantorRole: GrantorRole.SELF,
    })

    expect(consent._ultranos.grantorRole).toBe(GrantorRole.SELF)
    expect(consent._ultranos.grantorId).toBe('patient-123')
  })

  it('guardian consent grant and revoke cycle produces correct audit trail', async () => {
    mockEmitAuditEvent.mockClear()
    // Grant consent as guardian
    const grant = await createConsent({
      patientId: 'patient-123',
      scope: ConsentScope.PRESCRIPTIONS,
      purpose: ConsentPurpose.TREATMENT,
      hlcTimestamp: '2026-05-18T10:00:00Z',
      grantorRole: GrantorRole.GUARDIAN,
      grantorUserId: 'guardian-456',
    })

    // Emit guardian consent audit
    emitGuardianConsentAudit('grant', 'patient-123', 'guardian-456', grant.id, 'PRESCRIPTIONS')

    // Revoke consent as guardian
    const revoke = await withdrawConsent({
      patientId: 'patient-123',
      scope: ConsentScope.PRESCRIPTIONS,
      purpose: ConsentPurpose.TREATMENT,
      hlcTimestamp: '2026-05-18T10:01:00Z',
      grantorRole: GrantorRole.GUARDIAN,
      grantorUserId: 'guardian-456',
    })

    emitGuardianConsentAudit('revoke', 'patient-123', 'guardian-456', revoke.id, 'PRESCRIPTIONS')

    // Both audit events should have GUARDIAN_ACTION tag
    expect(mockEmitAuditEvent).toHaveBeenCalledTimes(2)
    for (const call of mockEmitAuditEvent.mock.calls) {
      expect(call[0].metadata.tag).toBe('GUARDIAN_ACTION')
      expect(call[0].action).toBe('GUARDIAN_ACTION')
    }

    // Grant should be ACTIVE, revoke should be WITHDRAWN
    expect(grant._ultranos.grantorRole).toBe(GrantorRole.GUARDIAN)
    expect(revoke._ultranos.grantorRole).toBe(GrantorRole.GUARDIAN)
  })
})

describe('Guardian Audit Logging', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('emitGuardianAudit emits correct event structure', () => {
    emitGuardianAudit('GUARDIAN_LINK_CREATED', 'patient-123', 'guardian-456')

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'GUARDIAN_LINK_CREATED',
        resourceType: 'GuardianLink',
        patientId: 'patient-123',
        outcome: 'success',
        metadata: expect.objectContaining({
          guardianUserId: 'guardian-456',
          tag: 'GUARDIAN_ACTION',
        }),
      }),
    )
  })

  it('emitGuardianConsentAudit includes consent details', () => {
    emitGuardianConsentAudit(
      'grant',
      'patient-123',
      'guardian-456',
      'consent-789',
      'PRESCRIPTIONS',
    )

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'GUARDIAN_ACTION',
        metadata: expect.objectContaining({
          consentAction: 'grant',
          consentId: 'consent-789',
          scope: 'PRESCRIPTIONS',
          tag: 'GUARDIAN_ACTION',
        }),
      }),
    )
  })

  it('audit events contain no PHI — only opaque IDs', () => {
    emitGuardianAudit('GUARDIAN_LINK_CREATED', 'patient-123', 'guardian-456')

    const call = mockEmitAuditEvent.mock.calls[0][0]
    const serialized = JSON.stringify(call)

    // Must not contain phone numbers, names, or other PHI patterns
    expect(serialized).not.toMatch(/\+\d{7,}/)
    expect(serialized).not.toMatch(/name/i)
    expect(serialized).not.toMatch(/phone/i)
    expect(serialized).not.toMatch(/address/i)
    expect(serialized).not.toMatch(/diagnosis/i)
  })

  it('audit events use GUARDIAN_ACTION tag per PRD HP-012', () => {
    emitGuardianConsentAudit(
      'revoke',
      'patient-123',
      'guardian-456',
      'consent-abc',
      'LABS',
    )

    const call = mockEmitAuditEvent.mock.calls[0][0]
    expect(call.metadata.tag).toBe('GUARDIAN_ACTION')
  })
})

describe('V1 Limit: One Guardian Per Patient', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects second guardian link when one is already active', async () => {
    // First call: getActiveGuardianLink returns an existing link
    mockGetFirstAsync.mockResolvedValueOnce({
      id: 'existing-link',
      patient_id: 'patient-123',
      guardian_user_id: 'guardian-existing',
      guardian_phone: 'hashed',
      guardian_phone_hint: '1111',
      role: 'GUARDIAN',
      linked_at: '2026-05-18T10:00:00Z',
      linked_by: 'PATIENT',
      status: 'active',
      revoked_at: null,
    })

    await expect(
      initiateGuardianLink('patient-123', '+93700111111'),
    ).rejects.toThrow('V1 limit')

    // OTP should NOT have been sent
    expect(mockSignInWithOtp).not.toHaveBeenCalled()
  })

  it('MAX_ACTIVE_GUARDIAN_LINKS constant equals 1', () => {
    expect(MAX_ACTIVE_GUARDIAN_LINKS).toBe(1)
  })
})

describe('Guardian Link — Notifications (AC #5)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetFirstAsync.mockResolvedValue(null)
  })

  it('confirmGuardianLink calls Hub API which triggers patient notification', async () => {
    mockHubApiSuccess('guardian-456')
    mockHubApiSideEffects()
    mockRunAsync.mockResolvedValue(undefined)

    await confirmGuardianLink('patient-123', '+93700123456', '123456')

    // Hub API createLink call triggers server-side notification
    const createLinkCall = mockFetch.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('guardian.createLink'),
    )
    expect(createLinkCall).toBeDefined()
    const body = JSON.parse(createLinkCall![1].body)
    expect(body.json.link.patientId).toBe('patient-123')
  })

  it('unlinkGuardian sends unlink notification to guardian via Hub API', async () => {
    mockGetFirstAsync.mockResolvedValue({ guardian_user_id: 'guardian-456' })
    mockRunAsync.mockResolvedValue(undefined)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    await unlinkGuardian('patient-123', 'link-1')

    const notifyCall = mockFetch.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('guardian.notifyUnlink'),
    )
    expect(notifyCall).toBeDefined()
    const body = JSON.parse(notifyCall![1].body)
    expect(body.json.guardianUserId).toBe('guardian-456')
  })
})
