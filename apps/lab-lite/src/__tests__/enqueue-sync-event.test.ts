import { describe, it, expect, beforeEach } from 'vitest'
import { vi } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, enqueueSyncEvent } from '../lib/db'
import { drainResultSyncQueue } from '../lib/result-sync'

describe('enqueueSyncEvent', () => {
  beforeEach(async () => {
    await getDb().table('syncQueue').clear()
  })

  it('stamps status=pending and queue metadata when the caller omits them', async () => {
    await enqueueSyncEvent({
      resourceType: 'Specimen',
      resourceId: 'spec-1',
      payload: { id: 'spec-1' },
      hlcTimestamp: 'hlc-1',
    } as never)

    const rows = await getDb().table('syncQueue').toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      resourceType: 'Specimen',
      resourceId: 'spec-1',
      status: 'pending',
      retryCount: 0,
      lastAttemptAt: null,
      hlcTimestamp: 'hlc-1',
    })
    expect(typeof rows[0].createdAt).toBe('string')
  })

  it('preserves an explicitly provided status and metadata', async () => {
    await enqueueSyncEvent({
      resourceType: 'ShiftHandover',
      resourceId: 'r-2',
      status: 'pending',
      payload: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      lastAttemptAt: null,
      retryCount: 3,
    })
    const row = (await getDb().table('syncQueue').toArray())[0]
    expect(row.retryCount).toBe(3)
    expect(row.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('result drain regression (real enqueue path)', () => {
  beforeEach(async () => { await getDb().table('syncQueue').clear() })

  it('drains a DiagnosticReport enqueued via the real enqueueSyncEvent', async () => {
    ;(global as any).fetch = vi.fn().mockResolvedValue({ ok: true })
    await enqueueSyncEvent({
      resourceType: 'DiagnosticReport',
      resourceId: 'dr-1',
      payload: { diagnosticReport: { id: 'dr-1' }, observations: [] },
      hlcTimestamp: 'hlc',
    } as never)

    const res = await drainResultSyncQueue(async () => 'tok')
    expect(res).toEqual({ synced: 1, failed: 0 })
    const row = (await getDb().table('syncQueue').toArray())[0]
    expect(row.status).toBe('synced')
  })
})
