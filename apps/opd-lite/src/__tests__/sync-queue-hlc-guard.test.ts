import { describe, it, expect, beforeEach } from 'vitest'
import { syncQueue } from '@/lib/sync-queue'
import { db } from '@/lib/db'

/**
 * Guard against the whole class of "update enqueued with a non-HLC timestamp"
 * bugs (ISO string or other malformed value) that cause silent Hub sync
 * failures. opd-lite uniformly stamps a serialized HLC, so the queue can
 * reject anything else at the source.
 */
describe('syncQueue enqueue HLC-format guard', () => {
  beforeEach(async () => {
    await db.syncQueue.clear()
  })

  const base = {
    resourceType: 'Condition',
    action: 'update' as const,
    payload: '{}',
  }

  it('rejects an ISO date string used as hlcTimestamp', async () => {
    await expect(
      syncQueue.enqueue({ ...base, resourceId: crypto.randomUUID(), hlcTimestamp: new Date().toISOString() }),
    ).rejects.toThrow(/serialized HLC/i)
  })

  it('rejects an empty hlcTimestamp', async () => {
    await expect(
      syncQueue.enqueue({ ...base, resourceId: crypto.randomUUID(), hlcTimestamp: '' }),
    ).rejects.toThrow(/serialized HLC/i)
  })

  it('accepts a valid serialized HLC', async () => {
    await expect(
      syncQueue.enqueue({ ...base, resourceId: crypto.randomUUID(), hlcTimestamp: '001789169375267:00000:node-1' }),
    ).resolves.toBeUndefined()
  })
})
