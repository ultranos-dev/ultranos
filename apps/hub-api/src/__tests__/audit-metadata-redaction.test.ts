import { describe, it, expect, vi } from 'vitest'

// ============================================================
// Story 61.1 (M-ADM-2) — audit metadata PHI redaction is SERVER-side and authoritative
// for both the viewer (listAuditEvents) and the CSV export (exportAuditEvents).
// ============================================================

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn() })),
  db: {
    toRow: (data: any) => data,
    fromRow: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: vi.fn().mockResolvedValue({}) })),
}))

const { sanitizeMetadata } = await import('../trpc/routers/admin')

describe('sanitizeMetadata — server-side authoritative redaction', () => {
  it('returns null for null metadata', () => {
    expect(sanitizeMetadata(null)).toBeNull()
  })

  it('redacts PHI-bearing keys by substring (matches + exceeds old client heuristic)', () => {
    const out = sanitizeMetadata({
      patient_name: 'Ali Ahmad',
      diagnosisText: 'hypertension',
      medicationDisplay: 'Amoxicillin',
      allergyList: 'penicillin',
      noteBody: 'freeform',
      symptom: 'cough',
      operation: 'admin_search',
      resultCount: 5,
    })!
    expect(out.patient_name).toBe('[REDACTED]')
    expect(out.diagnosisText).toBe('[REDACTED]')
    expect(out.medicationDisplay).toBe('[REDACTED]')
    expect(out.allergyList).toBe('[REDACTED]')
    expect(out.noteBody).toBe('[REDACTED]')
    expect(out.symptom).toBe('[REDACTED]')
    // Non-PHI operational keys pass through unchanged.
    expect(out.operation).toBe('admin_search')
    expect(out.resultCount).toBe(5)
  })

  it('truncates long freeform strings even under a non-PHI key', () => {
    const out = sanitizeMetadata({ reason: 'x'.repeat(200) })!
    expect(out.reason).toBe('[REDACTED — freeform text]')
  })

  it('recurses into shallow nested objects (e.g. filters) to redact PHI keys', () => {
    const out = sanitizeMetadata({
      filters: { role: 'ALL', patient_name: 'Ali' },
      endpoint: 'admin.export',
    })!
    expect(out.filters).toEqual({ role: 'ALL', patient_name: '[REDACTED]' })
    expect(out.endpoint).toBe('admin.export')
  })

  it('leaves safe scalar/array metadata intact', () => {
    const out = sanitizeMetadata({ updatedFields: ['status', 'tier'], count: 3, ok: true })!
    expect(out).toEqual({ updatedFields: ['status', 'tier'], count: 3, ok: true })
  })
})
