import { describe, it, expect, beforeEach } from 'vitest'
import { DexieAuditAdapter } from '@ultranos/audit-logger/adapters/dexie'
import { UserRole, AuditAction, AuditResourceType } from '@ultranos/shared-types'
import type { ClientAuditEvent } from '@ultranos/audit-logger/client'
import { db } from '@/lib/db'

function makeEvent(overrides?: Partial<ClientAuditEvent>): ClientAuditEvent {
  return {
    id: crypto.randomUUID(),
    actorId: 'user-001',
    actorRole: UserRole.DOCTOR,
    action: AuditAction.READ,
    resourceType: AuditResourceType.PATIENT,
    resourceId: 'patient-001',
    hlcTimestamp: '000001234567890:00000:node1',
    queuedAt: new Date().toISOString(),
    status: 'pending',
    ...overrides,
  }
}

describe('DexieAuditAdapter', () => {
  let adapter: DexieAuditAdapter

  beforeEach(async () => {
    await db.clientAuditLog.clear()
    adapter = new DexieAuditAdapter(db.clientAuditLog)
  })

  it('appends events to the Dexie table', async () => {
    const event = makeEvent()
    await adapter.append(event)

    const stored = await db.clientAuditLog.get(event.id)
    expect(stored).toBeDefined()
    expect(stored!.actorId).toBe('user-001')
    expect(stored!.status).toBe('pending')
  })

  it('fetches pending events in FIFO order', async () => {
    const e1 = makeEvent({ queuedAt: '2026-01-01T00:00:00Z' })
    const e2 = makeEvent({ queuedAt: '2026-01-01T00:00:01Z' })
    const e3 = makeEvent({ queuedAt: '2026-01-01T00:00:02Z' })

    // Insert out of order
    await adapter.append(e3)
    await adapter.append(e1)
    await adapter.append(e2)

    const pending = await adapter.getPending(10)
    expect(pending).toHaveLength(3)
    expect(pending[0].id).toBe(e1.id) // earliest first
    expect(pending[1].id).toBe(e2.id)
    expect(pending[2].id).toBe(e3.id)
  })

  it('only fetches pending events, not synced or failed', async () => {
    const e1 = makeEvent()
    const e2 = makeEvent()
    const e3 = makeEvent()

    await adapter.append(e1)
    await adapter.append(e2)
    await adapter.append(e3)

    // Transition status using the adapter's own methods (uses .modify()
    // which correctly updates compound indexes in fake-indexeddb)
    await adapter.markSynced([e2.id])
    await adapter.markFailed([e3.id])

    const pending = await adapter.getPending(10)
    expect(pending).toHaveLength(1)
    expect(pending[0].status).toBe('pending')
    expect(pending[0].id).toBe(e1.id)
  })

  it('marks events as synced', async () => {
    const e1 = makeEvent()
    const e2 = makeEvent()
    await adapter.append(e1)
    await adapter.append(e2)

    await adapter.markSynced([e1.id])

    const stored1 = await db.clientAuditLog.get(e1.id)
    const stored2 = await db.clientAuditLog.get(e2.id)
    expect(stored1!.status).toBe('synced')
    expect(stored2!.status).toBe('pending')
  })

  it('marks events as failed', async () => {
    const e1 = makeEvent()
    await adapter.append(e1)

    await adapter.markFailed([e1.id])

    const stored = await db.clientAuditLog.get(e1.id)
    expect(stored!.status).toBe('failed')
  })

  it('respects limit in getPending', async () => {
    for (let i = 0; i < 5; i++) {
      await adapter.append(makeEvent({ queuedAt: `2026-01-01T00:00:0${i}Z` }))
    }

    const pending = await adapter.getPending(2)
    expect(pending).toHaveLength(2)
  })

  it('is append-only — events accumulate without overwriting', async () => {
    for (let i = 0; i < 3; i++) {
      await adapter.append(makeEvent())
    }

    const total = await db.clientAuditLog.count()
    expect(total).toBe(3)
  })
})
