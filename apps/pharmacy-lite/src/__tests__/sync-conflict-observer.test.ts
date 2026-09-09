import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { recordSyncConflict } from '@/lib/sync-conflict-observer'
import { useSyncStore } from '@/stores/sync-store'
import type { ConflictResolution, SyncQueueEntry as EngineSyncQueueEntry } from '@ultranos/sync-engine'

function resolution(over: Partial<ConflictResolution>): ConflictResolution {
  return { strategy: 'LWW', winner: 'remote', kept: [], conflictFlag: true, blocksPrescription: false, ...over }
}

async function seedEntry(id: string) {
  await db.syncQueue.put({
    id, resourceType: 'Invoice', resourceId: 'inv-1', action: 'create' as const,
    payload: 'enc:v1:x', status: 'in-flight', hlcTimestamp: '000:000:n1',
    createdAt: '2026-01-01T00:00:00Z', retryCount: 0,
  })
}

beforeEach(async () => {
  await db.syncQueue.clear()
  useSyncStore.setState({ conflictCount: 0 })
})

describe('recordSyncConflict', () => {
  it('flags the entry and sets the store count for a genuine concurrent conflict', async () => {
    await seedEntry('e1')
    const entry = (await db.syncQueue.get('e1'))! as unknown as EngineSyncQueueEntry
    await recordSyncConflict(entry, resolution({ conflictFlag: true }))
    expect((await db.syncQueue.get('e1'))!.conflictFlag).toBe(true)
    expect(useSyncStore.getState().conflictCount).toBe(1)
  })

  it('does NOT flag a routine (non-concurrent) LWW overwrite', async () => {
    await seedEntry('e2')
    const entry = (await db.syncQueue.get('e2'))! as unknown as EngineSyncQueueEntry
    await recordSyncConflict(entry, resolution({ conflictFlag: false }))
    expect((await db.syncQueue.get('e2'))!.conflictFlag).toBeFalsy()
    expect(useSyncStore.getState().conflictCount).toBe(0)
  })

  it('never throws (best-effort) even if the entry is gone', async () => {
    const ghost = { id: 'missing', resourceType: 'Invoice', resourceId: 'x', action: 'create', payload: '', status: 'in-flight' as const, hlcTimestamp: 'h', createdAt: 'c', retryCount: 0 }
    await expect(recordSyncConflict(ghost as never, resolution({ conflictFlag: true }))).resolves.toBeUndefined()
  })

  it('does NOT persist any remote PHI payload (only the boolean flag)', async () => {
    await seedEntry('e3')
    const entry = (await db.syncQueue.get('e3'))! as unknown as EngineSyncQueueEntry
    await recordSyncConflict(entry, resolution({ conflictFlag: true, kept: [{ id: 'remote', data: { secret: 'PHI' }, hlcTimestamp: { wallMs: 1, counter: 0, nodeId: 'n' }, version: 'v' }] }))
    const stored = await db.syncQueue.get('e3')
    expect(JSON.stringify(stored)).not.toContain('PHI') // no conflictData / remote payload persisted
  })
})
