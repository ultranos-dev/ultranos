import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import crypto from 'crypto'

// Mock supabase before importing router
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

const mockSupabaseClient = {
  from: vi.fn(),
}

// ============================================================
// Test fixtures: Ed25519 key pair generated once for all tests
// ============================================================
let testKeyPair: crypto.KeyPairKeyObjectResult
let publicKeyBase64: string
let altKeyPair: crypto.KeyPairKeyObjectResult
let altPublicKeyBase64: string

beforeAll(() => {
  testKeyPair = crypto.generateKeyPairSync('ed25519')
  publicKeyBase64 = testKeyPair.publicKey
    .export({ type: 'spki', format: 'der' })
    .toString('base64')

  altKeyPair = crypto.generateKeyPairSync('ed25519')
  altPublicKeyBase64 = altKeyPair.publicKey
    .export({ type: 'spki', format: 'der' })
    .toString('base64')
})

function signPayload(payload: string, privateKey: crypto.KeyObject): string {
  return crypto.sign(null, Buffer.from(payload), privateKey).toString('base64')
}

// ============================================================
// Task 1: Ed25519 verification utility
// ============================================================
describe('verifyEd25519Signature', () => {
  let verifyEd25519Signature: (payload: string, signature: string, publicKey: string) => boolean

  beforeAll(async () => {
    const mod = await import('../lib/ed25519-verify')
    verifyEd25519Signature = mod.verifyEd25519Signature
  })

  it('returns true for a valid signature', () => {
    const payload = '{"id":"rx-1","med":"AMX500"}'
    const sig = signPayload(payload, testKeyPair.privateKey)

    expect(verifyEd25519Signature(payload, sig, publicKeyBase64)).toBe(true)
  })

  it('returns false for a tampered payload', () => {
    const payload = '{"id":"rx-1","med":"AMX500"}'
    const sig = signPayload(payload, testKeyPair.privateKey)

    expect(verifyEd25519Signature(payload + 'tampered', sig, publicKeyBase64)).toBe(false)
  })

  it('returns false for a wrong key', () => {
    const payload = '{"id":"rx-1","med":"AMX500"}'
    const sig = signPayload(payload, testKeyPair.privateKey)

    expect(verifyEd25519Signature(payload, sig, altPublicKeyBase64)).toBe(false)
  })

  it('returns false for invalid base64 signature', () => {
    const payload = '{"id":"rx-1","med":"AMX500"}'

    expect(verifyEd25519Signature(payload, '!!!invalid!!!', publicKeyBase64)).toBe(false)
  })

  it('returns false for invalid base64 public key', () => {
    const payload = '{"id":"rx-1","med":"AMX500"}'
    const sig = signPayload(payload, testKeyPair.privateKey)

    expect(verifyEd25519Signature(payload, sig, '!!!invalid!!!')).toBe(false)
  })
})

// ============================================================
// Task 2: KRL (Key Revocation List) server-side check
// ============================================================
describe('isKeyRevoked', () => {
  let isKeyRevoked: (publicKey: string, supabase: any) => Promise<boolean>

  beforeAll(async () => {
    const mod = await import('../lib/krl-check')
    isKeyRevoked = mod.isKeyRevoked
  })

  it('returns false for an active (non-revoked) key', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { public_key: 'key123', revoked_at: null },
              error: null,
            }),
          }),
        }),
      }),
    }

    expect(await isKeyRevoked('key123', mockSupabase)).toBe(false)
  })

  it('returns true for a revoked key (revoked_at IS NOT NULL)', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { public_key: 'key123', revoked_at: '2026-05-01T00:00:00Z' },
              error: null,
            }),
          }),
        }),
      }),
    }

    expect(await isKeyRevoked('key123', mockSupabase)).toBe(true)
  })

  it('returns true (fail-closed) when DB query fails', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST500', message: 'db error' },
            }),
          }),
        }),
      }),
    }

    expect(await isKeyRevoked('key123', mockSupabase)).toBe(true)
  })

  it('returns true (fail-closed) when key not found in practitioner_keys', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'not found' },
            }),
          }),
        }),
      }),
    }

    expect(await isKeyRevoked('unknown-key', mockSupabase)).toBe(true)
  })
})

// ============================================================
// Task 3/4/5: Integration tests for medication.getStatus
// with signature verification enforcement & audit events
// ============================================================
describe('medication.getStatus — signature verification enforcement', () => {
  let createCaller: any

  const TEST_USER = { sub: 'pharmacist-001', role: 'PHARMACIST', sessionId: 'sess-1', orgId: 'org-001' }
  const RX_UUID = '00000000-0000-4000-8000-000000000001'

  beforeAll(async () => {
    const { appRouter } = await import('../trpc/routers/_app')
    const init = await import('../trpc/init')
    createCaller = init.createCallerFactory(appRouter)
  })

  // P4: Shared spy to capture audit_log insert calls for assertion
  let auditInsertSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    auditInsertSpy = vi.fn().mockResolvedValue({ error: null })
  })

  function makeSignedBundle(payload: Record<string, unknown>, keyPair = testKeyPair, pubKey = publicKeyBase64) {
    const payloadStr = JSON.stringify(payload)
    const sig = signPayload(payloadStr, keyPair.privateKey)
    return { payload: payloadStr, sig, pub: pubKey }
  }

  // Audit log mock — passthrough for legacy select chain (verifyChain)
  function auditLogMock() {
    return {
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
  }

  /**
   * Create a mock `from()` that handles table dispatch.
   * - 'practitioner_keys' → KRL check result
   * - 'medication_requests' → prescription lookup result
   * - 'audit_log' → audit logger passthrough
   */
  function createMockFrom(opts: {
    krlResult?: { data: any; error: any }
    rxResult?: { data: any; error: any }
  }) {
    return vi.fn().mockImplementation((table: string) => {
      if (table === 'audit_log') return auditLogMock()

      // Entitlement middleware — return active subscription
      if (table === 'org_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'sub-1', status: 'ACTIVE' },
                    error: null,
                  }),
                  limit: vi.fn().mockResolvedValue({
                    data: [{ id: 'sub-1', status: 'ACTIVE' }],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }
      }

      if (table === 'practitioner_keys') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(
                opts.krlResult ?? { data: { revoked_at: null }, error: null },
              ),
            }),
          }),
        }
      }

      if (table === 'medication_requests') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(
                opts.rxResult ?? {
                  data: {
                    id: RX_UUID,
                    prescription_status: 'ACTIVE',
                    status: 'active',
                    medication_display: 'Amoxicillin 500mg',
                    authored_on: '2026-04-20T10:00:00Z',
                    dispensed_at: null,
                  },
                  error: null,
                },
              ),
            }),
          }),
        }
      }

      // Passthrough for unknown tables
      const proxy: any = {}
      return new Proxy(proxy, {
        get: (_t, prop) => {
          if (prop === 'then') return undefined
          return vi.fn().mockImplementation(() => new Proxy({}, {
            get: (_t2, p2) => {
              if (p2 === 'then') return undefined
              return vi.fn().mockResolvedValue({ data: null, error: null })
            },
          }))
        },
      })
    })
  }

  function createTestContext(mockFrom: ReturnType<typeof vi.fn>) {
    return {
      supabase: {
        from: mockFrom,
        rpc: auditInsertSpy.mockResolvedValue({ data: [{ chain_hash: 'abc123' }], error: null }),
      } as never,
      user: TEST_USER,
      headers: new Headers(),
    }
  }

  it('AC1: valid signed bundle → returns prescription status', async () => {
    const signedBundle = makeSignedBundle({ prescriptionId: RX_UUID })
    const mockEq = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          id: RX_UUID,
          prescription_status: 'ACTIVE',
          status: 'active',
          medication_display: 'Amoxicillin 500mg',
          authored_on: '2026-04-20T10:00:00Z',
          dispensed_at: null,
        },
        error: null,
      }),
    })
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'audit_log') return auditLogMock()
      if (table === 'org_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'sub-1', status: 'ACTIVE' },
                    error: null,
                  }),
                  limit: vi.fn().mockResolvedValue({
                    data: [{ id: 'sub-1', status: 'ACTIVE' }],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'practitioner_keys') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { revoked_at: null }, error: null }),
            }),
          }),
        }
      }
      if (table === 'medication_requests') {
        return { select: vi.fn().mockReturnValue({ eq: mockEq }) }
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })
    const caller = createCaller(createTestContext(mockFrom))

    const result = await caller.medication.getStatus({ signedBundle })

    expect(result.status).toBe('AVAILABLE')
    expect(result.prescriptionId).toBe(RX_UUID)
    expect(mockFrom).toHaveBeenCalledWith('medication_requests')
    // P6: Verify lookup uses correct column for prescriptionId
    expect(mockEq).toHaveBeenCalledWith('id', RX_UUID)
  })

  it('AC2: invalid signature → INVALID_SIGNATURE error, no DB lookup', async () => {
    const payload = JSON.stringify({ prescriptionId: RX_UUID })
    const signedBundle = {
      payload,
      sig: 'dGFtcGVyZWQ=', // base64 of "tampered" — invalid sig
      pub: publicKeyBase64,
    }
    const mockFrom = createMockFrom({})
    const caller = createCaller(createTestContext(mockFrom))

    await expect(
      caller.medication.getStatus({ signedBundle }),
    ).rejects.toThrow('INVALID_SIGNATURE')

    // Verify NO medication_requests lookup (signature failed before DB)
    const fromCalls = mockFrom.mock.calls.map((c: any[]) => c[0])
    expect(fromCalls).not.toContain('medication_requests')

    // P4: Verify SECURITY_VIOLATION audit event emitted via RPC
    expect(auditInsertSpy).toHaveBeenCalledWith(
      'audit_emit_with_lock',
      expect.objectContaining({ p_action: 'SECURITY_VIOLATION', p_metadata: expect.objectContaining({ reason: 'invalid_signature' }) }),
    )
  })

  it('AC3: revoked key → KEY_REVOKED error', async () => {
    const signedBundle = makeSignedBundle({ prescriptionId: RX_UUID })
    const mockFrom = createMockFrom({
      krlResult: { data: { revoked_at: '2026-05-01T00:00:00Z' }, error: null },
    })
    const caller = createCaller(createTestContext(mockFrom))

    await expect(
      caller.medication.getStatus({ signedBundle }),
    ).rejects.toThrow('KEY_REVOKED')

    // KRL check was performed
    const fromCalls = mockFrom.mock.calls.map((c: any[]) => c[0])
    expect(fromCalls).toContain('practitioner_keys')

    // P4: Verify SECURITY_VIOLATION audit event emitted with key_revoked reason
    expect(auditInsertSpy).toHaveBeenCalledWith(
      'audit_emit_with_lock',
      expect.objectContaining({ p_action: 'SECURITY_VIOLATION', p_metadata: expect.objectContaining({ reason: 'key_revoked' }) }),
    )
  })

  it('AC4: unsigned lookup (raw prescriptionId) → rejected', async () => {
    const mockFrom = createMockFrom({})
    const caller = createCaller(createTestContext(mockFrom))

    await expect(
      caller.medication.getStatus({ prescriptionId: RX_UUID }),
    ).rejects.toThrow('UNSIGNED_LOOKUP_REJECTED')

    // Verify NO medication_requests lookup
    const fromCalls = mockFrom.mock.calls.map((c: any[]) => c[0])
    expect(fromCalls).not.toContain('medication_requests')

    // P4: Verify SECURITY_VIOLATION audit event emitted with unsigned_lookup reason
    expect(auditInsertSpy).toHaveBeenCalledWith(
      'audit_emit_with_lock',
      expect.objectContaining({ p_action: 'SECURITY_VIOLATION', p_metadata: expect.objectContaining({ reason: 'unsigned_lookup' }) }),
    )
  })

  it('AC4: missing both signedBundle and IDs → BAD_REQUEST', async () => {
    const mockFrom = createMockFrom({})
    const caller = createCaller(createTestContext(mockFrom))

    await expect(
      caller.medication.getStatus({} as any),
    ).rejects.toThrow('signedBundle is required')
  })

  it('AC5: invalid signature rejects without reaching DB', async () => {
    const payload = JSON.stringify({ prescriptionId: RX_UUID })
    const signedBundle = { payload, sig: 'dGFtcGVyZWQ=', pub: publicKeyBase64 }
    const mockFrom = createMockFrom({})
    const caller = createCaller(createTestContext(mockFrom))

    await expect(
      caller.medication.getStatus({ signedBundle }),
    ).rejects.toThrow('INVALID_SIGNATURE')

    const fromCalls = mockFrom.mock.calls.map((c: any[]) => c[0])
    expect(fromCalls).not.toContain('medication_requests')
    expect(fromCalls).not.toContain('practitioner_keys')
  })

  it('AC5: unsigned lookup rejects without reaching DB', async () => {
    const mockFrom = createMockFrom({})
    const caller = createCaller(createTestContext(mockFrom))

    await expect(
      caller.medication.getStatus({ qrCodeId: 'some-qr-id' }),
    ).rejects.toThrow('UNSIGNED_LOOKUP_REJECTED')

    const fromCalls = mockFrom.mock.calls.map((c: any[]) => c[0])
    expect(fromCalls).not.toContain('medication_requests')
  })

  it('AC5: revoked key rejects after KRL check, before DB lookup', async () => {
    const signedBundle = makeSignedBundle({ prescriptionId: RX_UUID })
    const mockFrom = createMockFrom({
      krlResult: { data: { revoked_at: '2026-05-01T00:00:00Z' }, error: null },
    })
    const caller = createCaller(createTestContext(mockFrom))

    await expect(
      caller.medication.getStatus({ signedBundle }),
    ).rejects.toThrow('KEY_REVOKED')

    const fromCalls = mockFrom.mock.calls.map((c: any[]) => c[0])
    expect(fromCalls).toContain('practitioner_keys')
    expect(fromCalls).not.toContain('medication_requests')
  })

  it('valid signed bundle with qrCodeId → uses qr_code_id lookup', async () => {
    const signedBundle = makeSignedBundle({ qrCodeId: 'qr-abc-123' })
    const mockEq = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          id: RX_UUID,
          prescription_status: 'ACTIVE',
          status: 'active',
          medication_display: 'Aspirin 100mg',
          authored_on: '2026-04-20T10:00:00Z',
          dispensed_at: null,
        },
        error: null,
      }),
    })
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'audit_log') return auditLogMock()
      if (table === 'org_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'sub-1', status: 'ACTIVE' },
                    error: null,
                  }),
                  limit: vi.fn().mockResolvedValue({
                    data: [{ id: 'sub-1', status: 'ACTIVE' }],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'practitioner_keys') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { revoked_at: null }, error: null }),
            }),
          }),
        }
      }
      if (table === 'medication_requests') {
        return { select: vi.fn().mockReturnValue({ eq: mockEq }) }
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })
    const caller = createCaller(createTestContext(mockFrom))

    const result = await caller.medication.getStatus({ signedBundle })

    expect(result.status).toBe('AVAILABLE')
    expect(mockEq).toHaveBeenCalledWith('qr_code_id', 'qr-abc-123')
  })
})
