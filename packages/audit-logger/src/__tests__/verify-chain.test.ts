import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'crypto'

// ============================================================
// verifyChain — Story 61.1 (P-AUDIT-1 / P-AUDIT-3)
// Verifies:
//  - chain vNext (v2) hashes the FULL row (session/device/ip/denial/org/metadata)
//  - LEGACY (v1 / null) rows still verify under the 10-column hash across the boundary
//  - the newest window orders by chain_seq DESC (not timestamp)
//  - per-row dispatch on chain_version
// ============================================================

const { AuditLogger } = await import('../logger.js')

const GENESIS = '0000000000000000000000000000000000000000000000000000000000000000'

// ---- Reference hashers (mirror computeChainHash, kept independent for the test) ----
function canonicalJsonText(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return '[' + value.map((v) => (v === undefined ? 'null' : canonicalJsonText(v))).join(',') + ']'
  if (typeof value === 'object') {
    const parts: string[] = []
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key]
      if (v === null || v === undefined) continue
      parts.push(JSON.stringify(key) + ':' + canonicalJsonText(v))
    }
    return '{' + parts.join(',') + '}'
  }
  return JSON.stringify(value)
}

function legacyHash(prevHash: string, r: Record<string, unknown>): string {
  const fields: Array<[string, unknown]> = [
    ['prevHash', prevHash],
    ['id', r.id],
    ['timestamp', new Date(r.timestamp as string).toISOString()],
    ['actorId', r.actor_id],
    ['actorRole', r.actor_role],
    ['action', r.action],
    ['resourceType', r.resource_type],
    ['resourceId', r.resource_id],
    ['patientId', r.patient_id],
    ['outcome', r.outcome],
  ]
  const payload: Record<string, unknown> = {}
  for (const [k, v] of fields) if (v !== null && v !== undefined) payload[k] = v
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function fullRowHash(prevHash: string, r: Record<string, unknown>): string {
  const fields: Array<[string, unknown]> = [
    ['prevHash', prevHash],
    ['id', r.id],
    ['timestamp', new Date(r.timestamp as string).toISOString()],
    ['actorId', r.actor_id],
    ['actorRole', r.actor_role],
    ['action', r.action],
    ['resourceType', r.resource_type],
    ['resourceId', r.resource_id],
    ['patientId', r.patient_id],
    ['outcome', r.outcome],
    ['sessionId', r.session_id],
    ['deviceId', r.device_id],
    ['sourceIpHash', r.source_ip_hash],
    ['denialReason', r.denial_reason],
    ['orgId', r.org_id],
  ]
  if (r.metadata !== null && r.metadata !== undefined) {
    fields.push(['metadata', canonicalJsonText(r.metadata)])
  }
  const payload: Record<string, unknown> = {}
  for (const [k, v] of fields) if (v !== null && v !== undefined) payload[k] = v
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function verifyMockReturning(rows: Array<Record<string, unknown>>) {
  // The logger orders by chain_seq then limits; our mock ignores ordering args and
  // returns the given rows (already in the order the DB would yield: chain_seq DESC).
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          // newest branch: .order(...).limit(...)
          limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
          // ascending branch chains .order(...).order(...).limit(...)
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
          }),
        }),
      }),
    }),
  }
}

// Build a mixed chain: legacy(v1/null) anchor → legacy(v1) → full-row(v2) → full-row(v2)
function buildMixedChain() {
  const anchor: Record<string, unknown> = {
    id: 'anchor', timestamp: '2026-01-01T00:00:00.000Z', actor_id: 'u1', actor_role: 'DOCTOR',
    action: 'PHI_READ', resource_type: 'PATIENT', resource_id: 'p1', patient_id: 'p1', outcome: 'SUCCESS',
    session_id: null, device_id: null, source_ip_hash: null, denial_reason: null, org_id: null, metadata: null,
    chain_seq: 10, chain_version: null,
  }
  anchor.chain_hash = legacyHash(GENESIS, anchor)

  const legacyRow: Record<string, unknown> = {
    id: 'legacy-2', timestamp: '2026-01-01T00:00:01.000Z', actor_id: 'u1', actor_role: 'DOCTOR',
    action: 'PHI_READ', resource_type: 'PATIENT', resource_id: 'p2', patient_id: 'p2', outcome: 'SUCCESS',
    session_id: 's-ignored', device_id: 'd-ignored', source_ip_hash: null, denial_reason: null, org_id: 'org-ignored',
    metadata: { operation: 'ignored_by_v1' },
    chain_seq: 11, chain_version: 1,
  }
  legacyRow.chain_hash = legacyHash(anchor.chain_hash as string, legacyRow)

  const v2a: Record<string, unknown> = {
    id: 'v2-a', timestamp: '2026-01-01T00:00:02.000Z', actor_id: 'u1', actor_role: 'DOCTOR',
    action: 'PHI_WRITE', resource_type: 'PATIENT', resource_id: 'p3', patient_id: 'p3', outcome: 'SUCCESS',
    session_id: 'sess-1', device_id: 'dev-1', source_ip_hash: 'iphash', denial_reason: null, org_id: 'org-1',
    metadata: { operation: 'merge', updatedFields: ['tier', 'status'] },
    chain_seq: 12, chain_version: 2,
  }
  v2a.chain_hash = fullRowHash(legacyRow.chain_hash as string, v2a)

  const v2b: Record<string, unknown> = {
    id: 'v2-b', timestamp: '2026-01-01T00:00:03.000Z', actor_id: 'u2', actor_role: 'ADMIN',
    action: 'PHI_READ', resource_type: 'PATIENT', resource_id: 'p4', patient_id: 'p4', outcome: 'DENIED',
    session_id: 'sess-2', device_id: null, source_ip_hash: null, denial_reason: 'no_consent', org_id: 'org-1',
    metadata: null,
    chain_seq: 13, chain_version: 2,
  }
  v2b.chain_hash = fullRowHash(v2a.chain_hash as string, v2b)

  return { anchor, legacyRow, v2a, v2b }
}

describe('verifyChain — mixed legacy + full-row (vNext) dataset', () => {
  it('verifies a valid mixed chain (v1 anchor → v1 → v2 → v2)', async () => {
    const { anchor, legacyRow, v2a, v2b } = buildMixedChain()
    // DB returns newest-first (chain_seq DESC).
    const rows = [v2b, v2a, legacyRow, anchor]
    const logger = new AuditLogger(verifyMockReturning(rows) as any)
    const result = await logger.verifyChain(100)
    expect(result.valid).toBe(true)
    expect(result.checkedCount).toBe(3) // anchor is the trusted baseline
    expect(result.brokenAt).toBeUndefined()
  })

  it('detects tampering in a FULL-ROW-only column (org_id) that legacy would have ignored', async () => {
    const { anchor, legacyRow, v2a, v2b } = buildMixedChain()
    const tampered = { ...v2a, org_id: 'org-EVIL' } // chain_hash unchanged → must break
    const rows = [v2b, tampered, legacyRow, anchor]
    const logger = new AuditLogger(verifyMockReturning(rows) as any)
    const result = await logger.verifyChain(100)
    expect(result.valid).toBe(false)
    expect(result.brokenAt).toBe('v2-a')
  })

  it('detects tampering in full-row metadata', async () => {
    const { anchor, legacyRow, v2a, v2b } = buildMixedChain()
    const tampered = { ...v2a, metadata: { operation: 'merge', updatedFields: ['tier', 'EVIL'] } }
    const rows = [v2b, tampered, legacyRow, anchor]
    const logger = new AuditLogger(verifyMockReturning(rows) as any)
    const result = await logger.verifyChain(100)
    expect(result.valid).toBe(false)
    expect(result.brokenAt).toBe('v2-a')
  })

  it('still verifies legacy rows under the 10-column hash (extra columns ignored for v1)', async () => {
    const { anchor, legacyRow } = buildMixedChain()
    // Mutating a v1 row's non-hashed column must NOT break the chain (legacy hash ignores it).
    const legacyMutated = { ...legacyRow, org_id: 'changed', session_id: 'changed' }
    const rows = [legacyMutated, anchor]
    const logger = new AuditLogger(verifyMockReturning(rows) as any)
    const result = await logger.verifyChain(100)
    expect(result.valid).toBe(true)
    expect(result.checkedCount).toBe(1)
  })

  it('excludes null-chain_seq rows from the verifiable window', async () => {
    const { anchor, legacyRow } = buildMixedChain()
    const nullSeq = { ...legacyRow, chain_seq: null }
    const rows = [nullSeq, { ...anchor, chain_seq: null }]
    const logger = new AuditLogger(verifyMockReturning(rows) as any)
    const result = await logger.verifyChain(100)
    expect(result.valid).toBe(true)
    expect(result.checkedCount).toBe(0)
  })
})
