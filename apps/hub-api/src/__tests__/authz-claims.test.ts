import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { SignJWT } from 'jose'
import { UserRole } from '@ultranos/shared-types'

/**
 * Story 56.1 (audit C-SYS-1) — server-authoritative authorization claims.
 *
 * Verifies that role / org / facility / status are read EXCLUSIVELY from
 * `app_metadata` (service-role writable) and that forged, user-writable
 * `user_metadata` claims can neither escalate privileges nor clear a
 * suspension.
 */

const TEST_SECRET = 'test-secret-key-at-least-32-chars-long'

vi.stubEnv('SUPABASE_JWT_SECRET', TEST_SECRET)
vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn() })),
  db: {
    toRow: (data: unknown) => data,
    toRowRaw: (data: unknown) => data,
    fromRow: (data: unknown) => data,
    fromRowRaw: (data: unknown) => data,
    fromRows: (data: unknown[]) => data,
  },
  selectExactCount: vi.fn(),
}))

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: vi.fn().mockResolvedValue({}),
  })),
}))

vi.mock('@/lib/field-encryption', () => ({
  encryptRow: (data: Record<string, unknown>) => data,
  decryptRow: (data: Record<string, unknown>) => data,
  decryptRows: (data: Record<string, unknown>[]) => data,
  getCachedEncryptionKey: () => 'a'.repeat(64),
  getFieldEncryptionKeys: () => ({ encryptionKey: 'a'.repeat(64), hmacKey: 'b'.repeat(64) }),
  validateEncryptionConfig: () => {},
  encryptJsonbValue: (v: unknown) => `v1:${JSON.stringify(v)}`,
}))

const { createTRPCContext, createTRPCRouter, createCallerFactory, protectedProcedure } =
  await import('../trpc/init')
const { adminRouter } = await import('../trpc/routers/admin')
const { patientAdminRouter } = await import('../trpc/routers/patient-admin')
const { syncRouter } = await import('../trpc/routers/sync')
const { ROLE_PERMISSIONS, hasResourceAccess } = await import('../trpc/rbac')
const { resolveAuthzClaims } = await import('../lib/jwt')

/** Mint an HS256 token the Hub's verifySupabaseJwt accepts (legacy path). */
async function mintToken(payload: Record<string, unknown>): Promise<string> {
  const secret = new TextEncoder().encode(TEST_SECRET)
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret)
}

async function ctxFromToken(token: string) {
  return createTRPCContext({ headers: new Headers({ authorization: `Bearer ${token}` }) })
}

/** Minimal protected router to exercise the real suspension gate in init.ts. */
const pingRouter = createTRPCRouter({
  ping: protectedProcedure.query(() => 'ok'),
})

beforeEach(() => {
  vi.clearAllMocks()
})

afterAll(() => {
  vi.unstubAllEnvs()
})

describe('AC 2 — forged user_metadata.role=ADMIN is rejected', () => {
  const forgedPayload = {
    sub: 'user-forged-1',
    role: 'authenticated', // real GoTrue top-level role
    session_id: 'sess-forged',
    user_metadata: { role: 'ADMIN', org_id: 'org-forged' },
    // No app_metadata role — the server never granted one.
  }

  it('createTRPCContext never derives role/org from user_metadata', async () => {
    const ctx = await ctxFromToken(await mintToken(forgedPayload))
    expect(ctx.user).not.toBeNull()
    expect(ctx.user!.role).not.toBe('ADMIN')
    expect(ctx.user!.orgId).toBeNull()
  })

  it('adminProcedure (admin.health) rejects with FORBIDDEN', async () => {
    const ctx = await ctxFromToken(await mintToken(forgedPayload))
    const caller = createCallerFactory(adminRouter)(ctx)
    await expect(caller.health()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('patient-admin.getById rejects with FORBIDDEN', async () => {
    const ctx = await ctxFromToken(await mintToken(forgedPayload))
    const caller = createCallerFactory(patientAdminRouter)(ctx)
    await expect(
      caller.getById({ patientId: '00000000-0000-4000-8000-000000000001' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('sync.push rejects every operation with FORBIDDEN', async () => {
    const ctx = await ctxFromToken(await mintToken(forgedPayload))
    const caller = createCallerFactory(syncRouter)(ctx)
    const result = await caller.push({
      operations: [
        {
          resourceType: 'Patient',
          resourceId: '00000000-0000-4000-8000-000000000001',
          action: 'create',
          payload: '{}',
          hlcTimestamp: '2026-01-01T00:00:00.000Z-0001-node1',
        },
      ],
    })
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toMatchObject({ success: false, error: 'FORBIDDEN' })
  })

  it('defense-in-depth: logs a security warning with opaque ids only (Task 1.3)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await ctxFromToken(await mintToken(forgedPayload))
      const securityWarnings = warnSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('[SECURITY]'),
      )
      expect(securityWarnings.length).toBeGreaterThan(0)
      // Opaque identifiers only — never the claim VALUE or PHI.
      expect(securityWarnings[0]?.[1]).toEqual({ sub: 'user-forged-1', sessionId: 'sess-forged' })
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe('AC 3 — suspension is server-authoritative and not self-clearable', () => {
  it('blocks when app_metadata.status=SUSPENDED even if user_metadata.status was rewritten', async () => {
    const token = await mintToken({
      sub: 'user-susp-1',
      role: 'authenticated',
      session_id: 'sess-susp',
      app_metadata: { role: 'DOCTOR', status: 'SUSPENDED' },
      // Attacker cleared their own user_metadata status via auth.updateUser().
      user_metadata: { role: 'DOCTOR', status: 'ACTIVE' },
    })
    const ctx = await ctxFromToken(token)
    expect(ctx.user!.status).toBe('SUSPENDED')

    const caller = createCallerFactory(pingRouter)(ctx)
    await expect(caller.ping()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'ACCOUNT_SUSPENDED',
    })
  })

  it('active user with app_metadata.status=ACTIVE passes the suspension gate', async () => {
    const token = await mintToken({
      sub: 'user-act-1',
      role: 'authenticated',
      session_id: 'sess-act',
      app_metadata: { role: 'DOCTOR', status: 'ACTIVE' },
    })
    const ctx = await ctxFromToken(token)
    const caller = createCallerFactory(pingRouter)(ctx)
    await expect(caller.ping()).resolves.toBe('ok')
  })
})

describe('AC 1 — role matrix resolves from app_metadata', () => {
  const roles = Object.values(UserRole)

  it.each(roles)('%s resolves from app_metadata and matches ROLE_PERMISSIONS', async (role) => {
    const token = await mintToken({
      sub: `user-${role.toLowerCase()}`,
      role: 'authenticated',
      session_id: `sess-${role.toLowerCase()}`,
      app_metadata: { role, org_id: 'org-1', facility_id: 'fac-1', status: 'ACTIVE' },
      // Conflicting user_metadata must be ignored entirely.
      user_metadata: { role: 'ADMIN', org_id: 'org-forged', status: 'ACTIVE' },
    })
    const ctx = await ctxFromToken(token)
    expect(ctx.user!.role).toBe(role)
    expect(ctx.user!.orgId).toBe('org-1')
    expect(ctx.user!.facilityId).toBe('fac-1')
    expect(ctx.user!.status).toBe('ACTIVE')

    // RBAC matrix consistency: the context role feeds hasResourceAccess exactly
    // as rbac.ts defines it for that role.
    const perms = ROLE_PERMISSIONS[role]
    for (const resource of ['Patient', 'MedicationRequest', 'DiagnosticReport', 'Consent']) {
      const expected = perms ? perms.has('*') || perms.has(resource) : false
      expect(hasResourceAccess(ctx.user!.role, resource)).toBe(expected)
    }
  })

  it('ADMIN from app_metadata is accepted by adminProcedure', async () => {
    const token = await mintToken({
      sub: 'user-real-admin',
      role: 'authenticated',
      session_id: 'sess-admin',
      app_metadata: { role: 'ADMIN', org_id: 'org-1' },
    })
    const ctx = await ctxFromToken(token)
    const caller = createCallerFactory(adminRouter)(ctx)
    const result = await caller.health()
    expect(result.status).toBe('ok')
  })
})

describe('resolveAuthzClaims — unit behavior', () => {
  it('reads all four fields from app_metadata only', () => {
    const claims = resolveAuthzClaims({
      sub: 'u1',
      app_metadata: { role: 'pharmacist', org_id: 'o1', facility_id: 'f1', status: 'ACTIVE' },
      user_metadata: { role: 'ADMIN', org_id: 'o-bad', facility_id: 'f-bad', status: 'SUSPENDED' },
    })
    expect(claims).toEqual({ role: 'PHARMACIST', orgId: 'o1', facilityId: 'f1', status: 'ACTIVE' })
  })

  it('returns no-access defaults when only user_metadata carries claims', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const claims = resolveAuthzClaims({
        sub: 'u2',
        user_metadata: { role: 'ADMIN', org_id: 'o-bad', status: 'ACTIVE' },
      })
      expect(claims.role).toBe('')
      expect(claims.orgId).toBeNull()
      expect(claims.facilityId).toBeNull()
      expect(claims.status).toBeNull()
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('still honors server-signed top-level claims (GoTrue/custom hook)', () => {
    // Top-level claims are minted by the server, not user-writable.
    const claims = resolveAuthzClaims({
      sub: 'u3',
      role: 'DOCTOR',
      org_id: 'o-top',
      facility_id: 'f-top',
    } as never)
    expect(claims.role).toBe('DOCTOR')
    expect(claims.orgId).toBe('o-top')
    expect(claims.facilityId).toBe('f-top')
  })
})
