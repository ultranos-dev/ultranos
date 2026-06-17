import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// users.getProfile — Task 1 of Pharmopedia E4 plan
// Tests: patient branch (decrypt name/dob, sign photo, audit PHI_READ),
//        practitioner branch (decrypt phone, org name, audit READ),
//        missing record shell (no throw), legacy public-URL photo extraction.
// ============================================================

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

const { mockDecrypt, mockEmit, mockCreateSignedUrl } = vi.hoisted(() => ({
  mockDecrypt: vi.fn((v: string) => (v?.startsWith('v1:') ? v.slice(3) : v?.startsWith('enc:') ? v.slice(4) : v)),
  mockEmit: vi.fn().mockResolvedValue(undefined),
  mockCreateSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed/u.jpg' }, error: null }),
}))

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    pipeline: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('@ultranos/crypto/server', () => ({
  encryptField: (v: string) => `enc:${v}`,
  decryptField: (v: string, _key: string) => mockDecrypt(v),
  generateBlindIndex: vi.fn((v: string) => v),
  getEncryptionConfig: () => ({ randomizedFields: [] }),
}))

vi.mock('@/lib/field-encryption', () => ({
  getFieldEncryptionKeys: () => ({ encryptionKey: 'a'.repeat(64), hmacKey: 'b'.repeat(64) }),
  getCachedEncryptionKey: () => 'a'.repeat(64),
  validateEncryptionConfig: () => {},
  encryptRow: (row: Record<string, unknown>) => row,
  decryptRow: (row: Record<string, unknown>) => row,
  decryptRows: (rows: unknown[]) => rows,
}))

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockEmit })),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
  db: {
    toRow: (d: Record<string, unknown>) => d,
    toRowRaw: (d: Record<string, unknown>) => d,
    fromRow: (d: Record<string, unknown>) => d,
    fromRowRaw: (d: Record<string, unknown>) => d,
    fromRows: (d: unknown[]) => d,
  },
}))

// Dynamic imports mirror the account-discovery.test.ts harness exactly
const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

// A chainable supabase stub: each .from() returns a chainable object whose
// terminal .maybeSingle() resolves to the queued result for that table.
function makeSupabase(tableResults: Record<string, unknown>) {
  const storage = { from: (_bucket: string) => ({ createSignedUrl: mockCreateSignedUrl }) }
  const from = (table: string) => {
    const chain: Record<string, (...args: unknown[]) => unknown> = {}
    for (const m of ['select', 'eq']) {
      chain[m] = () => chain
    }
    chain.maybeSingle = async () => ({ data: (tableResults[table] as unknown) ?? null, error: null })
    return chain
  }
  return { from, storage } as unknown
}

function callerFor(role: string, supabase: unknown) {
  return createCaller({
    supabase,
    user: { sub: 'auth-1', role, sessionId: 'sess-1', orgId: null, facilityId: null, status: 'ACTIVE' },
    headers: new Headers(),
  } as never)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('users.getProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDecrypt.mockImplementation((v: string) => (v?.startsWith('v1:') ? v.slice(3) : v?.startsWith('enc:') ? v.slice(4) : v))
  })

  it('patient: decrypts name/dob, signs photo, audits PHI_READ', async () => {
    const supabase = makeSupabase({
      patients: {
        id: 'pat-1',
        name_local_enc: 'enc:Sara Ahmadi',
        name_given_enc: 'enc:Sara',
        name_family_enc: 'enc:Ahmadi',
        gender: 'female',
        birth_date_enc: 'enc:1990-05-15',
        birth_year: 1990,
        telecom_phone: '+93700000000',
        blood_group: 'O+',
        photo_url: 'u1/avatar.jpg',
        preferred_language: 'prs',
        patient_tier: 'PREMIUM',
        address_province_current: 'Kabul',
        address_district_current: 'Kabul',
        address_village_current: null,
      },
    })

    const res = await callerFor('PATIENT', supabase).users.getProfile()

    expect(res.kind).toBe('patient')
    if (res.kind !== 'patient') throw new Error('unexpected kind')

    expect(res.displayName).toBe('Sara Ahmadi')
    expect(res.phone).toBe('+93700000000')
    expect(res.tier).toBe('PREMIUM')
    expect(res.photoUrl).toBe('https://signed/u.jpg')
    expect(res.currentAddress?.province).toBe('Kabul')
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('u1/avatar.jpg', 3600)
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_READ',
        resourceType: 'PATIENT',
        resourceId: 'pat-1',
        actorId: 'auth-1',
        outcome: 'SUCCESS',
      }),
    )
    // Audit metadata must not contain PHI (no patient name)
    const meta = mockEmit.mock.calls[0][0].metadata
    expect(JSON.stringify(meta)).not.toContain('Sara')
  })

  it('practitioner: decrypts phone, resolves org name, audits READ', async () => {
    const supabase = makeSupabase({
      practitioners: {
        id: 'prac-1',
        given_name: 'Ahmad',
        family_name: 'Khan',
        telecom_email: 'a@x.io',
        telecom_phone: 'v1:+93701112222',
        role: 'DOCTOR',
        status: 'ACTIVE',
        org_id: 'org-1',
        facility_id: null,
        qualification_display: 'MD',
        identifier_value: 'LIC-9',
        license_expiry: '2030-01-01',
      },
      organizations: { name: 'Kabul Clinic' },
    })

    const res = await callerFor('DOCTOR', supabase).users.getProfile()

    expect(res.kind).toBe('practitioner')
    if (res.kind !== 'practitioner') throw new Error('unexpected kind')

    expect(res.displayName).toBe('Ahmad Khan')
    expect(res.phone).toBe('+93701112222')
    expect(res.organization).toBe('Kabul Clinic')
    expect(res.licenseId).toBe('LIC-9')
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'READ',
        resourceType: 'PRACTITIONER',
        resourceId: 'prac-1',
      }),
    )
  })

  it('no record: returns minimal shell, does not throw, still audits', async () => {
    const res = await callerFor('PATIENT', makeSupabase({})).users.getProfile()
    expect(res).toEqual({ kind: 'patient', displayName: '', givenName: '', tier: 'FREE' })
    expect(mockEmit).toHaveBeenCalled()
  })

  it('patient photo: legacy public URL is path-extracted before signing', async () => {
    const supabase = makeSupabase({
      patients: {
        id: 'pat-2',
        name_local: 'X',
        photo_url: 'https://h/storage/v1/object/public/profile-photos/u2/avatar.png',
        patient_tier: 'FREE',
      },
    })

    await callerFor('PATIENT', supabase).users.getProfile()
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('u2/avatar.png', 3600)
  })
})
