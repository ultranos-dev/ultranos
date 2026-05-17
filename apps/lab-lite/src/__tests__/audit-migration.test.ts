import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  emitClientAudit,
  setAuditStoreAdapter,
  type AuditStoreAdapter,
  type ClientAuditEvent,
} from '@ultranos/audit-logger/client'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'

// Mock the auth session store
const mockSession = {
  userId: 'tech-001',
  practitionerId: 'prac-001',
  role: 'LAB_TECH',
  sessionId: 'sess-001',
  email: 'tech@lab.test',
  labName: 'Test Lab',
  technicianName: 'Test Tech',
}
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    () => ({ session: mockSession }),
    { getState: () => ({ session: mockSession }) },
  ),
}))

// Mock HLC
vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test-node' }) },
  serializeHlc: () => '000001234567890:00000:test-node',
}))

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: 'test-token' } } }),
    },
  }),
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

// Must import AFTER mocks are set up
const { reportAuthEvent, reportQueueAuditEvent } = await import('@/lib/audit-client')

describe('Auth audit events via canonical logger', () => {
  it('emits LOGIN_SUCCESS with correct action and outcome metadata', async () => {
    reportAuthEvent('LOGIN_SUCCESS', { actorId: 'user-123' })

    // emitClientAudit is async internally, give it a tick
    await vi.waitFor(() => expect(captured).toHaveLength(1))

    const event = captured[0]
    expect(event.action).toBe(AuditAction.LOGIN)
    expect(event.resourceType).toBe(AuditResourceType.USER_ACCOUNT)
    expect(event.actorId).toBe('user-123')
    expect(event.actorRole).toBe(UserRole.LAB_TECH)
    expect(event.metadata).toMatchObject({
      authEvent: 'LOGIN_SUCCESS',
      outcome: 'SUCCESS',
      source: 'lab-lite',
    })
    expect(event.status).toBe('pending')
  })

  it('emits LOGIN_FAILURE with redacted email', async () => {
    reportAuthEvent('LOGIN_FAILURE', { actorEmail: 'secret@test.com' })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    const event = captured[0]
    expect(event.action).toBe(AuditAction.LOGIN)
    expect(event.metadata).toMatchObject({
      authEvent: 'LOGIN_FAILURE',
      outcome: 'FAILURE',
      failedEmail: '[REDACTED]',
      source: 'lab-lite',
    })
    // Email must not appear in metadata
    expect(JSON.stringify(event.metadata)).not.toContain('secret@test.com')
  })

  it('emits MFA_VERIFY_SUCCESS via canonical logger', async () => {
    reportAuthEvent('MFA_VERIFY_SUCCESS')

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    const event = captured[0]
    expect(event.action).toBe(AuditAction.MFA_FAIL)
    expect(event.metadata).toMatchObject({
      authEvent: 'MFA_VERIFY_SUCCESS',
      outcome: 'SUCCESS',
      source: 'lab-lite',
    })
  })

  it('emits MFA_VERIFY_FAILURE via canonical logger', async () => {
    reportAuthEvent('MFA_VERIFY_FAILURE')

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    const event = captured[0]
    expect(event.action).toBe(AuditAction.MFA_FAIL)
    expect(event.metadata).toMatchObject({
      authEvent: 'MFA_VERIFY_FAILURE',
      outcome: 'FAILURE',
      source: 'lab-lite',
    })
  })

  it('never throws on auth audit event emission', () => {
    // reportAuthEvent is synchronous (fire-and-forget via void emitClientAudit)
    expect(() => {
      reportAuthEvent('LOGIN_SUCCESS', { actorId: 'user-123' })
    }).not.toThrow()
  })

  it('includes HLC timestamp on auth events', async () => {
    reportAuthEvent('LOGIN_SUCCESS', { actorId: 'user-123' })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    expect(captured[0].hlcTimestamp).toBe('000001234567890:00000:test-node')
  })
})

describe('Queue audit events via canonical logger', () => {
  it('emits QUEUE_ENTRY_CREATED with correct action mapping', async () => {
    reportQueueAuditEvent({
      action: 'QUEUE_ENTRY_CREATED',
      queueEntryId: 1,
      testCategory: 'Blood Work — CBC',
      patientRef: 'ref-123',
      timestamp: '2026-04-30T10:00:00Z',
    })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    const event = captured[0]
    expect(event.action).toBe(AuditAction.CREATE)
    expect(event.resourceType).toBe(AuditResourceType.LAB_RESULT)
    expect(event.resourceId).toBe('1')
    expect(event.actorRole).toBe(UserRole.LAB_TECH)
    expect(event.status).toBe('pending')
  })

  it('emits QUEUE_DRAIN_SUCCESS as UPDATE/SUCCESS', async () => {
    reportQueueAuditEvent({
      action: 'QUEUE_DRAIN_SUCCESS',
      queueEntryId: 2,
      testCategory: 'HbA1c',
      patientRef: 'ref-456',
      timestamp: '2026-04-30T11:00:00Z',
    })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    expect(captured[0].action).toBe(AuditAction.UPDATE)
  })

  it('emits QUEUE_ITEM_EXPIRED as UPDATE', async () => {
    reportQueueAuditEvent({
      action: 'QUEUE_ITEM_EXPIRED',
      queueEntryId: 3,
      testCategory: 'Lipid Panel',
      patientRef: 'ref-789',
      timestamp: '2026-04-30T12:00:00Z',
    })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    expect(captured[0].action).toBe(AuditAction.UPDATE)
  })

  it('emits QUEUE_ITEM_DISCARDED as UPDATE', async () => {
    reportQueueAuditEvent({
      action: 'QUEUE_ITEM_DISCARDED',
      queueEntryId: 4,
      testCategory: 'Urinalysis',
      patientRef: 'ref-xyz',
      timestamp: '2026-04-30T13:00:00Z',
    })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    expect(captured[0].action).toBe(AuditAction.UPDATE)
  })

  it('preserves all metadata fields after migration', async () => {
    reportQueueAuditEvent({
      action: 'QUEUE_DRAIN_SUCCESS',
      queueEntryId: 42,
      testCategory: 'Thyroid Function — TSH',
      patientRef: 'ref-full',
      timestamp: '2026-04-30T14:00:00Z',
      technicianId: 'tech-001',
    })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    const md = captured[0].metadata as Record<string, unknown>
    expect(md.outcome).toBe('SUCCESS')
    expect(md.queueEntryId).toBe(42)
    expect(md.testCategory).toBe('Thyroid Function — TSH')
    expect(md.patientRef).toBe('ref-full')
    expect(md.timestamp).toBe('2026-04-30T14:00:00Z')
    expect(md.source).toBe('lab-lite')
  })

  it('never throws on queue audit event emission', () => {
    expect(() => {
      reportQueueAuditEvent({
        action: 'QUEUE_ENTRY_CREATED',
        queueEntryId: 1,
        testCategory: 'CBC',
        patientRef: 'ref-123',
        timestamp: '2026-04-30T10:00:00Z',
      })
    }).not.toThrow()
  })

  it('uses session actorId when available', async () => {
    reportQueueAuditEvent({
      action: 'QUEUE_ENTRY_CREATED',
      queueEntryId: 1,
      testCategory: 'CBC',
      patientRef: 'ref-123',
      timestamp: '2026-04-30T10:00:00Z',
    })

    await vi.waitFor(() => expect(captured).toHaveLength(1))

    expect(captured[0].actorId).toBe('tech-001')
  })
})

describe('IndexedDB persistence for failed events', () => {
  it('events are written to store adapter (IndexedDB proxy)', async () => {
    reportAuthEvent('LOGIN_SUCCESS', { actorId: 'user-123' })

    await vi.waitFor(() => expect(mockAdapter.append).toHaveBeenCalledTimes(1))

    const storedEvent = (mockAdapter.append as ReturnType<typeof vi.fn>).mock.calls[0][0] as ClientAuditEvent
    expect(storedEvent.status).toBe('pending')
    expect(storedEvent.id).toBeTruthy()
  })

  it('events are persisted even when network would fail', async () => {
    // The adapter always writes locally first — network is handled by drain worker
    reportQueueAuditEvent({
      action: 'QUEUE_ENTRY_CREATED',
      queueEntryId: 1,
      testCategory: 'CBC',
      patientRef: 'ref-123',
      timestamp: '2026-04-30T10:00:00Z',
    })

    await vi.waitFor(() => expect(mockAdapter.append).toHaveBeenCalledTimes(1))

    // Event was persisted locally — not dropped
    expect(captured).toHaveLength(1)
    expect(captured[0].status).toBe('pending')
  })
})
