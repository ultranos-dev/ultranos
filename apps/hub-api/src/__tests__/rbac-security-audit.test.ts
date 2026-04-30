import { describe, it, expect, vi } from 'vitest'
import { TRPCError } from '@trpc/server'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn() })),
}))

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: vi.fn().mockResolvedValue({}),
  })),
}))

const { createCallerFactory } = await import('../trpc/init')
const { consentRouter } = await import('../trpc/routers/consent')
const { medicationRouter } = await import('../trpc/routers/medication')
const { patientRouter } = await import('../trpc/routers/patient')

function makeCtx(user: { sub: string; role: string; sessionId: string } | null) {
  // Mock supabase with realistic chain methods
  // Consent check needs: from().select().eq().order() → { data: [], error: null }
  const single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
  const order = vi.fn().mockResolvedValue({ data: [], error: null })
  const limit = vi.fn().mockResolvedValue({ data: [], error: null })
  const eq = vi.fn().mockReturnValue({ single, limit, order })
  const orMethod = vi.fn().mockReturnValue({ eq })
  const select = vi.fn().mockReturnValue({ eq, or: orMethod, order, single })
  const insert = vi.fn().mockReturnValue({ select })
  const from = vi.fn().mockReturnValue({ select, insert })

  return {
    supabase: { from } as never,
    user,
    headers: new Headers(),
  }
}

describe('RBAC Security Audit — AC 3: Role-based access enforcement', () => {
  describe('PHARMACIST restrictions', () => {
    it('Pharmacist CANNOT read patient search (Patient resource)', async () => {
      const caller = createCallerFactory(patientRouter)(
        makeCtx({ sub: 'pharm-1', role: 'PHARMACIST', sessionId: 's1' }),
      )
      await expect(caller.search({ query: 'John' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })

    it('Pharmacist CAN check medication status (MedicationRequest resource)', async () => {
      const caller = createCallerFactory(medicationRouter)(
        makeCtx({ sub: 'pharm-1', role: 'PHARMACIST', sessionId: 's1' }),
      )
      // Will fail with NOT_FOUND (prescription doesn't exist in mock) — not FORBIDDEN
      await expect(
        caller.getStatus({ prescriptionId: '550e8400-e29b-41d4-a716-446655440000' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('Pharmacist CANNOT access consent endpoints', async () => {
      const caller = createCallerFactory(consentRouter)(
        makeCtx({ sub: 'pharm-1', role: 'PHARMACIST', sessionId: 's1' }),
      )
      await expect(
        caller.check({ patientId: 'p1', resourceType: 'Patient' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })
  })

  describe('PATIENT restrictions', () => {
    it('Patient CAN access consent check (Consent resource)', async () => {
      const ctx = makeCtx({ sub: 'patient-1', role: 'PATIENT', sessionId: 's1' })
      const caller = createCallerFactory(consentRouter)(ctx)
      // Won't throw FORBIDDEN — will return permitted: false (no consent in mock)
      const result = await caller.check({ patientId: 'patient-1', resourceType: 'Patient' })
      expect(result).toHaveProperty('permitted')
    })

    it('Patient CANNOT access medication status', async () => {
      const caller = createCallerFactory(medicationRouter)(
        makeCtx({ sub: 'patient-1', role: 'PATIENT', sessionId: 's1' }),
      )
      await expect(
        caller.getStatus({ prescriptionId: '550e8400-e29b-41d4-a716-446655440000' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('Patient CAN access patient search (Patient resource)', async () => {
      const caller = createCallerFactory(patientRouter)(
        makeCtx({ sub: 'patient-1', role: 'PATIENT', sessionId: 's1' }),
      )
      // Will not throw FORBIDDEN — Patient has Patient resource access
      const result = await caller.search({ query: 'self' })
      expect(result).toHaveProperty('patients')
    })
  })

  describe('Unauthenticated access', () => {
    it('unauthenticated user CANNOT access patient search', async () => {
      const caller = createCallerFactory(patientRouter)(makeCtx(null))
      await expect(caller.search({ query: 'John' })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    })

    it('unauthenticated user CANNOT access medication status', async () => {
      const caller = createCallerFactory(medicationRouter)(makeCtx(null))
      await expect(
        caller.getStatus({ prescriptionId: '550e8400-e29b-41d4-a716-446655440000' }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })

    it('unauthenticated user CANNOT access consent check', async () => {
      const caller = createCallerFactory(consentRouter)(makeCtx(null))
      await expect(
        caller.check({ patientId: 'p1', resourceType: 'Patient' }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })

    it('unauthenticated user CANNOT sync consent', async () => {
      const caller = createCallerFactory(consentRouter)(makeCtx(null))
      await expect(
        caller.sync({
          id: '550e8400-e29b-41d4-a716-446655440000',
          status: 'ACTIVE',
          category: ['PRESCRIPTIONS'],
          patientRef: 'Patient/p1',
          dateTime: '2026-04-29T10:00:00Z',
          provisionStart: '2026-04-29T10:00:00Z',
          grantorId: 'p1',
          grantorRole: 'SELF',
          purpose: 'TREATMENT',
          consentVersion: '1.0',
          auditHash: 'abc',
          hlcTimestamp: 'hlc-1',
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })
  })

  describe('DOCTOR (clinician) access', () => {
    it('Doctor CAN access patient search', async () => {
      const caller = createCallerFactory(patientRouter)(
        makeCtx({ sub: 'doc-1', role: 'DOCTOR', sessionId: 's1' }),
      )
      const result = await caller.search({ query: 'test' })
      expect(result).toHaveProperty('patients')
    })

    it('Doctor CAN check medication status', async () => {
      const caller = createCallerFactory(medicationRouter)(
        makeCtx({ sub: 'doc-1', role: 'DOCTOR', sessionId: 's1' }),
      )
      // NOT_FOUND, not FORBIDDEN
      await expect(
        caller.getStatus({ prescriptionId: '550e8400-e29b-41d4-a716-446655440000' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('Doctor CAN access consent check', async () => {
      const caller = createCallerFactory(consentRouter)(
        makeCtx({ sub: 'doc-1', role: 'DOCTOR', sessionId: 's1' }),
      )
      const result = await caller.check({ patientId: 'p1', resourceType: 'Patient' })
      expect(result).toHaveProperty('permitted')
    })
  })

  describe('ADMIN access', () => {
    it('Admin CAN access any endpoint', async () => {
      const adminCtx = makeCtx({ sub: 'admin-1', role: 'ADMIN', sessionId: 's1' })

      const patientCaller = createCallerFactory(patientRouter)(adminCtx)
      const result = await patientCaller.search({ query: 'test' })
      expect(result).toHaveProperty('patients')

      const consentCaller = createCallerFactory(consentRouter)(adminCtx)
      const consentResult = await consentCaller.check({ patientId: 'p1', resourceType: 'Patient' })
      expect(consentResult).toHaveProperty('permitted')
    })
  })

  describe('Consent sync — grantor impersonation (D167)', () => {
    const baseConsentInput = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'ACTIVE' as const,
      category: ['PRESCRIPTIONS'],
      patientRef: 'Patient/patient-001',
      dateTime: '2026-04-29T10:00:00Z',
      provisionStart: '2026-04-29T10:00:00Z',
      grantorRole: 'SELF' as const,
      purpose: 'TREATMENT' as const,
      consentVersion: '1.0',
      auditHash: 'abc123',
      hlcTimestamp: 'hlc-001',
    }

    it('Patient CANNOT sync consent as another patient (impersonation blocked)', async () => {
      const caller = createCallerFactory(consentRouter)(
        makeCtx({ sub: 'attacker-999', role: 'PATIENT', sessionId: 's1' }),
      )
      await expect(
        caller.sync({ ...baseConsentInput, grantorId: 'patient-001' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('Doctor CANNOT sync consent as a patient (impersonation blocked)', async () => {
      const caller = createCallerFactory(consentRouter)(
        makeCtx({ sub: 'doctor-001', role: 'DOCTOR', sessionId: 's1' }),
      )
      await expect(
        caller.sync({ ...baseConsentInput, grantorId: 'patient-001' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })
  })
})
