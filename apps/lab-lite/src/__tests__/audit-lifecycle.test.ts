/**
 * Story 43.1 — Immutable Result Audit Chain
 * Tests: lifecycle event emission, chain verification, tamper detection, offline support.
 *
 * Task 6 AC coverage:
 *   - AC 1, 2: All 7 event types emit correct action/resourceType/resourceId/metadata
 *   - AC 9: AuditResourceType.LAB_SAMPLE for sample-scoped events
 *   - AC 10: Never throws
 *   - AC 12: PHI guard, chain integrity, tamper detection, offline, empty chain
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  emitClientAudit,
  setAuditStoreAdapter,
  type AuditStoreAdapter,
  type ClientAuditEvent,
} from '@ultranos/audit-logger/client'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'
import Dexie from 'dexie'
import { DexieAuditAdapter } from '@ultranos/audit-logger/adapters/dexie'
import { verifyResultAuditChain } from '@/lib/audit-chain-verifier'

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------

const mockSession = {
  userId: 'tech-001',
  practitionerId: 'prac-001',
  role: 'LAB_TECH',
  sessionId: 'sess-001',
  email: 'tech@lab.test',
  labName: 'Test Lab',
}

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    () => ({ session: mockSession }),
    { getState: () => ({ session: mockSession }) },
  ),
}))

vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test-node' }) },
  serializeHlc: () => '000001234567890:00000:test-node',
}))

// Capture emitted events via a mock adapter
let captured: ClientAuditEvent[]
let mockAdapter: AuditStoreAdapter

beforeEach(() => {
  captured = []
  mockAdapter = {
    append: vi.fn(async (event: ClientAuditEvent) => {
      captured.push(event)
    }),
  }
  setAuditStoreAdapter(mockAdapter)
})

afterEach(() => {
  vi.clearAllMocks()
})

// Must import AFTER mocks are set up
const { reportLabLifecycleEvent } = await import('@/lib/audit-client')

// ---------------------------------------------------------------------------
// Unit tests: reportLabLifecycleEvent emission
// ---------------------------------------------------------------------------

describe('reportLabLifecycleEvent — event emission', () => {
  it('SAMPLE_RECEIVED emits correct action + LAB_SAMPLE resourceType', async () => {
    reportLabLifecycleEvent({
      event: 'SAMPLE_RECEIVED',
      sampleId: 'LAB-20260601-0001',
      custodyFrom: 'courier-001',
      custodyTo: 'tech-001',
    })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    const ev = captured[0]!
    expect(ev.action).toBe(AuditAction.SAMPLE_RECEIVED)
    expect(ev.resourceType).toBe(AuditResourceType.LAB_SAMPLE)
    expect(ev.resourceId).toBe('LAB-20260601-0001')
    expect(ev.actorId).toBe('tech-001')
    expect(ev.metadata).toMatchObject({
      lifecycleEvent: 'SAMPLE_RECEIVED',
      sampleId: 'LAB-20260601-0001',
      custodyFrom: 'courier-001',
      custodyTo: 'tech-001',
      outcome: 'SUCCESS',
      source: 'lab-lite',
    })
    expect(ev.status).toBe('pending')
  })

  it('SAMPLE_PROCESSED emits correct action + LAB_SAMPLE resourceType', async () => {
    reportLabLifecycleEvent({ event: 'SAMPLE_PROCESSED', sampleId: 'LAB-20260601-0001' })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    const ev = captured[0]!
    expect(ev.action).toBe(AuditAction.SAMPLE_PROCESSED)
    expect(ev.resourceType).toBe(AuditResourceType.LAB_SAMPLE)
    expect(ev.resourceId).toBe('LAB-20260601-0001')
  })

  it('RESULT_ENTERED emits correct action + LAB_RESULT resourceType', async () => {
    reportLabLifecycleEvent({
      event: 'RESULT_ENTERED',
      sampleId: 'LAB-20260601-0001',
      orderId: 'order-abc',
      diagnosticReportId: 'dr-xyz',
    })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    const ev = captured[0]!
    expect(ev.action).toBe(AuditAction.RESULT_ENTERED)
    expect(ev.resourceType).toBe(AuditResourceType.LAB_RESULT)
    expect(ev.resourceId).toBe('LAB-20260601-0001')
    expect(ev.metadata).toMatchObject({
      lifecycleEvent: 'RESULT_ENTERED',
      orderId: 'order-abc',
      diagnosticReportId: 'dr-xyz',
    })
  })

  it('RESULT_AUTHORIZED emits correct action + LAB_RESULT resourceType', async () => {
    reportLabLifecycleEvent({ event: 'RESULT_AUTHORIZED', sampleId: 'LAB-20260601-0001' })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    expect(captured[0]!.action).toBe(AuditAction.RESULT_AUTHORIZED)
    expect(captured[0]!.resourceType).toBe(AuditResourceType.LAB_RESULT)
  })

  it('RESULT_RELEASED emits correct action + LAB_RESULT resourceType', async () => {
    reportLabLifecycleEvent({ event: 'RESULT_RELEASED', sampleId: 'LAB-20260601-0001' })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    expect(captured[0]!.action).toBe(AuditAction.RESULT_RELEASED)
    expect(captured[0]!.resourceType).toBe(AuditResourceType.LAB_RESULT)
  })

  it('RESULT_AMENDED emits correct action + LAB_RESULT resourceType', async () => {
    reportLabLifecycleEvent({
      event: 'RESULT_AMENDED',
      sampleId: 'LAB-20260601-0001',
      amendmentReason: 'CLERICAL_ERROR',
    })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    const ev = captured[0]!
    expect(ev.action).toBe(AuditAction.RESULT_AMENDED)
    expect(ev.resourceType).toBe(AuditResourceType.LAB_RESULT)
    expect(ev.metadata).toMatchObject({ amendmentReason: 'CLERICAL_ERROR' })
  })

  it('RESULT_DELIVERED emits correct action + LAB_RESULT resourceType', async () => {
    reportLabLifecycleEvent({
      event: 'RESULT_DELIVERED',
      sampleId: 'LAB-20260601-0001',
      deliveryMethod: 'opd_sync',
    })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    const ev = captured[0]!
    expect(ev.action).toBe(AuditAction.RESULT_DELIVERED)
    expect(ev.resourceType).toBe(AuditResourceType.LAB_RESULT)
    expect(ev.metadata).toMatchObject({ deliveryMethod: 'opd_sync' })
  })

  it('uses session userId as actorId', async () => {
    reportLabLifecycleEvent({ event: 'SAMPLE_RECEIVED', sampleId: 'LAB-20260601-0001' })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    expect(captured[0]!.actorId).toBe('tech-001')
  })

  it('falls back to technicianId when no session', async () => {
    // Override the mock for this test only
    const store = await import('@/stores/auth-session-store')
    vi.spyOn(store.useAuthSessionStore, 'getState').mockReturnValueOnce({ session: null } as never)

    reportLabLifecycleEvent({
      event: 'RESULT_ENTERED',
      sampleId: 'LAB-20260601-0001',
      technicianId: 'fallback-tech',
    })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    expect(captured[0]!.actorId).toBe('fallback-tech')
  })

  it('resourceId is always sampleId — the canonical chain identifier', async () => {
    reportLabLifecycleEvent({
      event: 'RESULT_AUTHORIZED',
      sampleId: 'LAB-20260601-0042',
      diagnosticReportId: 'dr-separate-id',
    })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    // resourceId must be sampleId, not diagnosticReportId
    expect(captured[0]!.resourceId).toBe('LAB-20260601-0042')
  })

  it('includes HLC timestamp on all lifecycle events', async () => {
    reportLabLifecycleEvent({ event: 'SAMPLE_RECEIVED', sampleId: 'LAB-20260601-0001' })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    expect(captured[0]!.hlcTimestamp).toBe('000001234567890:00000:test-node')
  })
})

// ---------------------------------------------------------------------------
// Unit tests: PHI guard
// ---------------------------------------------------------------------------

describe('reportLabLifecycleEvent — PHI guard', () => {
  it('does not include PHI field names in metadata', async () => {
    // The existing PHI guard in emitClientAudit strips known field names.
    // We validate that no PHI names slip through in the lifecycle metadata.
    reportLabLifecycleEvent({ event: 'SAMPLE_RECEIVED', sampleId: 'LAB-20260601-0001' })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    const metadata = captured[0]!.metadata!
    const phiFields = ['name', 'firstName', 'lastName', 'birthDate', 'diagnosis', 'medicationName']
    for (const field of phiFields) {
      expect(metadata).not.toHaveProperty(field)
    }
  })

  it('emitClientAudit PHI guard strips accidentally added PHI fields', async () => {
    // Inject a fake adapter that captures BEFORE the PHI guard fires.
    // We test by calling emitClientAudit directly with a PHI field.
    const phiCaptured: ClientAuditEvent[] = []
    const phiAdapter: AuditStoreAdapter = {
      append: vi.fn(async (ev) => { phiCaptured.push(ev) }),
    }
    setAuditStoreAdapter(phiAdapter)

    // emitClientAudit should strip the 'name' field (known PHI)
    void emitClientAudit({
      actorId: 'tech-001',
      actorRole: UserRole.LAB_TECH,
      action: AuditAction.SAMPLE_RECEIVED,
      resourceType: AuditResourceType.LAB_SAMPLE,
      resourceId: 'LAB-20260601-0001',
      hlcTimestamp: '000001234567890:00000:test-node',
      metadata: {
        sampleId: 'LAB-20260601-0001',
        name: 'SHOULD BE STRIPPED',  // PHI field
        source: 'lab-lite',
      },
    })

    await vi.waitFor(() => expect(phiCaptured).toHaveLength(1))

    expect(phiCaptured[0]!.metadata).not.toHaveProperty('name')
    expect(phiCaptured[0]!.metadata).toHaveProperty('sampleId')
  })
})

// ---------------------------------------------------------------------------
// Unit tests: never-throw guarantee
// ---------------------------------------------------------------------------

describe('reportLabLifecycleEvent — never throws', () => {
  it('does not throw even if adapter is null', () => {
    setAuditStoreAdapter(null as never)

    expect(() => {
      reportLabLifecycleEvent({ event: 'SAMPLE_RECEIVED', sampleId: 'LAB-20260601-0001' })
    }).not.toThrow()
  })

  it('does not throw if adapter throws internally', () => {
    const throwingAdapter: AuditStoreAdapter = {
      append: vi.fn(async () => { throw new Error('storage full') }),
    }
    setAuditStoreAdapter(throwingAdapter)

    expect(() => {
      reportLabLifecycleEvent({ event: 'SAMPLE_RECEIVED', sampleId: 'LAB-20260601-0001' })
    }).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Integration tests: hash chain verification using fake-indexeddb
// ---------------------------------------------------------------------------

/**
 * Create an in-memory Dexie database for testing.
 * Uses fake-indexeddb (pre-configured by jsdom environment).
 */
function createTestAuditDb() {
  const db = new Dexie('audit-test-' + Math.random().toString(36).slice(2))
  db.version(1).stores({
    clientAuditLog: 'id, status, queuedAt, [status+queuedAt]',
  })
  return {
    db,
    table: db.table<ClientAuditEvent, string>('clientAuditLog'),
  }
}

describe('verifyResultAuditChain — hash chain integrity', () => {
  it('valid chain: 3 lifecycle events in sequence', async () => {
    const { table } = createTestAuditDb()
    const adapter = new DexieAuditAdapter(table)

    const sampleId = 'LAB-20260601-CHAIN-001'
    const base: Omit<ClientAuditEvent, 'id' | 'queuedAt' | 'status'> = {
      actorId: 'tech-001',
      actorRole: UserRole.LAB_TECH,
      action: AuditAction.SAMPLE_RECEIVED,
      resourceType: AuditResourceType.LAB_SAMPLE,
      resourceId: sampleId,
      hlcTimestamp: '000001:00000:node',
      metadata: { sampleId, lifecycleEvent: 'SAMPLE_RECEIVED', outcome: 'SUCCESS', source: 'lab-lite' },
    }

    await adapter.append({ ...base, id: 'evt-001', queuedAt: '2026-06-01T10:00:00Z', status: 'pending' })
    await adapter.append({
      ...base,
      id: 'evt-002',
      queuedAt: '2026-06-01T10:01:00Z',
      status: 'pending',
      action: AuditAction.SAMPLE_PROCESSED,
      metadata: { sampleId, lifecycleEvent: 'SAMPLE_PROCESSED', outcome: 'SUCCESS', source: 'lab-lite' },
    })
    await adapter.append({
      ...base,
      id: 'evt-003',
      queuedAt: '2026-06-01T10:02:00Z',
      status: 'pending',
      action: AuditAction.RESULT_ENTERED,
      resourceType: AuditResourceType.LAB_RESULT,
      metadata: { sampleId, lifecycleEvent: 'RESULT_ENTERED', outcome: 'SUCCESS', source: 'lab-lite' },
    })

    const result = await verifyResultAuditChain(sampleId, table)
    expect(result.valid).toBe(true)
    expect(result.checkedCount).toBe(3)
    expect(result.brokenAt).toBeUndefined()
  })

  it('tamper detection: modified metadata breaks the chain', async () => {
    const { table } = createTestAuditDb()
    const adapter = new DexieAuditAdapter(table)

    const sampleId = 'LAB-20260601-TAMPER-001'
    const base: Omit<ClientAuditEvent, 'id' | 'queuedAt' | 'status'> = {
      actorId: 'tech-001',
      actorRole: UserRole.LAB_TECH,
      action: AuditAction.SAMPLE_RECEIVED,
      resourceType: AuditResourceType.LAB_SAMPLE,
      resourceId: sampleId,
      hlcTimestamp: '000001:00000:node',
      metadata: { sampleId, lifecycleEvent: 'SAMPLE_RECEIVED', outcome: 'SUCCESS', source: 'lab-lite' },
    }

    await adapter.append({ ...base, id: 'tamper-001', queuedAt: '2026-06-01T10:00:00Z', status: 'pending' })
    await adapter.append({
      ...base,
      id: 'tamper-002',
      queuedAt: '2026-06-01T10:01:00Z',
      status: 'pending',
      metadata: { sampleId, lifecycleEvent: 'SAMPLE_PROCESSED', outcome: 'SUCCESS', source: 'lab-lite' },
    })

    // Tamper: modify the metadata of tamper-001 directly in Dexie
    await table.update('tamper-001', {
      metadata: {
        sampleId,
        lifecycleEvent: 'SAMPLE_RECEIVED',
        outcome: 'SUCCESS',
        source: 'lab-lite',
        TAMPERED: true,  // injected field — hash will not match
      },
    })

    const result = await verifyResultAuditChain(sampleId, table)
    expect(result.valid).toBe(false)
    expect(result.brokenAt).toBe('tamper-001')
    expect(result.checkedCount).toBe(1)
  })

  it('empty chain: non-existent sampleId returns valid with checkedCount 0', async () => {
    const { table } = createTestAuditDb()

    const result = await verifyResultAuditChain('NON-EXISTENT-SAMPLE', table)
    expect(result.valid).toBe(true)
    expect(result.checkedCount).toBe(0)
    expect(result.brokenAt).toBeUndefined()
  })

  it('offline verification: works without any network mocks', async () => {
    // This test purposely has no network mocks — all operations are Dexie-only.
    const { table } = createTestAuditDb()
    const adapter = new DexieAuditAdapter(table)
    const sampleId = 'LAB-20260601-OFFLINE-001'

    await adapter.append({
      id: 'offline-evt-001',
      queuedAt: '2026-06-01T10:00:00Z',
      status: 'pending',
      actorId: 'tech-001',
      actorRole: UserRole.LAB_TECH,
      action: AuditAction.SAMPLE_RECEIVED,
      resourceType: AuditResourceType.LAB_SAMPLE,
      resourceId: sampleId,
      hlcTimestamp: '000001:00000:node',
      metadata: { sampleId, lifecycleEvent: 'SAMPLE_RECEIVED', outcome: 'SUCCESS', source: 'lab-lite' },
    })

    // No fetch/XHR mocks — verifier is purely local
    const result = await verifyResultAuditChain(sampleId, table)
    expect(result.valid).toBe(true)
    expect(result.checkedCount).toBe(1)
  })

  it('events without chainHash are skipped gracefully (legacy compat)', async () => {
    const { table } = createTestAuditDb()
    const sampleId = 'LAB-20260601-LEGACY-001'

    // Insert directly without going through DexieAuditAdapter (simulates pre-43.1 events)
    await table.add({
      id: 'legacy-001',
      queuedAt: '2026-06-01T09:00:00Z',
      status: 'synced' as const,
      actorId: 'tech-001',
      actorRole: UserRole.LAB_TECH,
      action: AuditAction.SAMPLE_RECEIVED,
      resourceType: AuditResourceType.LAB_SAMPLE,
      resourceId: sampleId,
      hlcTimestamp: '000000:00000:node',
      metadata: { sampleId, lifecycleEvent: 'SAMPLE_RECEIVED', outcome: 'SUCCESS', source: 'lab-lite' },
      // No chainHash — legacy event
    })

    const result = await verifyResultAuditChain(sampleId, table)
    // Legacy events without chainHash are treated as unverifiable, not broken
    // checkedCount includes them in the total
    expect(result.valid).toBe(true)
  })

  it('chain broken at second event is detected correctly', async () => {
    const { table } = createTestAuditDb()
    const adapter = new DexieAuditAdapter(table)
    const sampleId = 'LAB-20260601-CHAIN-BREAK'

    const base: Omit<ClientAuditEvent, 'id' | 'queuedAt' | 'status'> = {
      actorId: 'tech-001',
      actorRole: UserRole.LAB_TECH,
      action: AuditAction.SAMPLE_RECEIVED,
      resourceType: AuditResourceType.LAB_SAMPLE,
      resourceId: sampleId,
      hlcTimestamp: '000001:00000:node',
      metadata: { sampleId, lifecycleEvent: 'SAMPLE_RECEIVED', outcome: 'SUCCESS', source: 'lab-lite' },
    }

    await adapter.append({ ...base, id: 'break-001', queuedAt: '2026-06-01T10:00:00Z', status: 'pending' })
    await adapter.append({
      ...base,
      id: 'break-002',
      queuedAt: '2026-06-01T10:01:00Z',
      status: 'pending',
      metadata: { sampleId, lifecycleEvent: 'SAMPLE_PROCESSED', outcome: 'SUCCESS', source: 'lab-lite' },
    })
    await adapter.append({
      ...base,
      id: 'break-003',
      queuedAt: '2026-06-01T10:02:00Z',
      status: 'pending',
      metadata: { sampleId, lifecycleEvent: 'RESULT_ENTERED', outcome: 'SUCCESS', source: 'lab-lite' },
    })

    // Tamper second event
    await table.update('break-002', {
      metadata: { sampleId, lifecycleEvent: 'SAMPLE_PROCESSED', outcome: 'TAMPERED', source: 'lab-lite' },
    })

    const result = await verifyResultAuditChain(sampleId, table)
    expect(result.valid).toBe(false)
    expect(result.brokenAt).toBe('break-002')
    expect(result.checkedCount).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Integration tests: new AuditAction enum values exist
// ---------------------------------------------------------------------------

describe('AuditAction enum — new lifecycle values', () => {
  it.each([
    'SAMPLE_RECEIVED',
    'SAMPLE_PROCESSED',
    'RESULT_ENTERED',
    'RESULT_AUTHORIZED',
    'RESULT_RELEASED',
    'RESULT_AMENDED',
    'RESULT_DELIVERED',
  ] as const)('AuditAction.%s is defined', (action) => {
    expect(AuditAction[action]).toBe(action)
  })

  it('AuditResourceType.LAB_SAMPLE is defined', () => {
    expect(AuditResourceType.LAB_SAMPLE).toBe('LAB_SAMPLE')
  })
})
