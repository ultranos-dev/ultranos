import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UserRole, AuditAction, AuditResourceType } from '@ultranos/shared-types'

// ============================================================
// Client metadata WHITELIST guard — Story 61.1 (P-AUDIT-2)
// Verifies emitClientAudit sanitizes metadata against the shape whitelist:
//  - scalars / scalar-arrays / shallow objects pass
//  - over-length strings, deep objects, functions are dropped
//  - PHI field NAMES are dropped (belt-and-suspenders)
//  - arrays are RECURSED (the old blocklist skipped arrays entirely)
// ============================================================

const {
  emitClientAudit,
  setAuditStoreAdapter,
  sanitizeAuditMetadata,
  MAX_METADATA_STRING_LEN,
} = await import('../client.js')

function baseInput(metadata: Record<string, unknown>) {
  return {
    actorId: 'actor-1',
    actorRole: UserRole.DOCTOR,
    action: AuditAction.PHI_READ,
    resourceType: AuditResourceType.PATIENT,
    resourceId: 'res-1',
    hlcTimestamp: '2026-01-01T00:00:00.000Z-0000',
    metadata,
  }
}

describe('sanitizeAuditMetadata — shape whitelist', () => {
  it('keeps whitelisted scalar shapes', () => {
    const { sanitized, dropped } = sanitizeAuditMetadata({
      operation: 'admin_search',
      resultCount: 5,
      isComplete: true,
      nothing: null,
    })
    expect(dropped).toEqual([])
    expect(sanitized).toEqual({ operation: 'admin_search', resultCount: 5, isComplete: true, nothing: null })
  })

  it('recurses into arrays of scalars (old guard skipped arrays)', () => {
    const { sanitized, dropped } = sanitizeAuditMetadata({
      updatedFields: ['status', 'tier'],
      ids: [1, 2, 3],
    })
    expect(dropped).toEqual([])
    expect(sanitized).toEqual({ updatedFields: ['status', 'tier'], ids: [1, 2, 3] })
  })

  it('rejects a PHI value hidden inside an array element (over-length string)', () => {
    const longName = 'x'.repeat(MAX_METADATA_STRING_LEN + 1)
    const { sanitized, dropped } = sanitizeAuditMetadata({ notes: ['ok', longName] })
    expect(dropped).toContain('notes')
    expect(sanitized).not.toHaveProperty('notes')
  })

  it('drops PHI field names even with a short/valid value', () => {
    const { sanitized, dropped } = sanitizeAuditMetadata({ name: 'Ali', medicationDisplay: 'Amoxicillin', ok: 1 })
    expect(dropped).toEqual(expect.arrayContaining(['name', 'medicationDisplay']))
    expect(sanitized).toEqual({ ok: 1 })
  })

  it('allows one level of nested object of scalars but rejects deeper nesting', () => {
    const shallow = sanitizeAuditMetadata({ filters: { role: 'ALL', active: true } })
    expect(shallow.dropped).toEqual([])
    expect(shallow.sanitized).toEqual({ filters: { role: 'ALL', active: true } })

    const deep = sanitizeAuditMetadata({ a: { b: { c: 1 } } })
    expect(deep.dropped).toEqual(['a'])
    expect(deep.sanitized).toEqual({})
  })

  it('drops over-length top-level strings and non-JSON values', () => {
    const { sanitized, dropped } = sanitizeAuditMetadata({
      big: 'y'.repeat(MAX_METADATA_STRING_LEN + 1),
      fn: (() => 1) as unknown,
      okStr: 'short',
    })
    expect(dropped).toEqual(expect.arrayContaining(['big', 'fn']))
    expect(sanitized).toEqual({ okStr: 'short' })
  })
})

describe('emitClientAudit — applies the whitelist before storing', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('stores the sanitized metadata, never PHI-named keys', async () => {
    const appended: unknown[] = []
    setAuditStoreAdapter({ append: async (e) => { appended.push(e) } })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await emitClientAudit(baseInput({ name: 'Ali', operation: 'x', source: 'opd-lite' }) as any)

    expect(appended).toHaveLength(1)
    const stored = appended[0] as { metadata: Record<string, unknown> }
    expect(stored.metadata).not.toHaveProperty('name')
    expect(stored.metadata).toEqual({ operation: 'x', source: 'opd-lite' })
  })

  it('never throws even if the adapter throws', async () => {
    setAuditStoreAdapter({ append: async () => { throw new Error('boom') } })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(emitClientAudit(baseInput({ ok: 1 }) as any)).resolves.toBeUndefined()
  })
})
