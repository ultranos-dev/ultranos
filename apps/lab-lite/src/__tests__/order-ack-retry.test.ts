/**
 * order-ack-retry.test.ts — Story 60.4 (Task 1 / AC 2).
 *
 * The order-ack was previously fired one-shot inside the pull loop and swallowed
 * on failure. These tests cover the DURABLE replacement: enqueue → drain →
 * success/transient-requeue/permanent-dead-letter, backed by the real Dexie
 * `orderAckQueue` table (fake-indexeddb), with acknowledgeOrder mocked.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import {
  getDb,
  enqueueOrderAck,
  getPendingOrderAcks,
  getFailedOrderAcks,
} from '../lib/db'

const mockAcknowledgeOrder = vi.fn()
vi.mock('../lib/trpc', () => ({
  acknowledgeOrder: (...args: unknown[]) => mockAcknowledgeOrder(...args),
}))

const { drainOrderAckQueue } = await import('../lib/order-ack-sync')

const token = async () => 'tok'

beforeEach(async () => {
  vi.clearAllMocks()
  await getDb().orderAckQueue.clear()
})

describe('order-ack retry queue', () => {
  it('enqueue is idempotent and does not re-queue an already-acked order', async () => {
    await enqueueOrderAck('order-1')
    await getDb().orderAckQueue.update('order-1', { status: 'acked' })
    await enqueueOrderAck('order-1') // must NOT reset an acked entry
    const entry = await getDb().orderAckQueue.get('order-1')
    expect(entry?.status).toBe('acked')
  })

  it('drain marks an ack DONE on success', async () => {
    mockAcknowledgeOrder.mockResolvedValue(undefined)
    await enqueueOrderAck('order-2')

    const res = await drainOrderAckQueue(token)

    expect(res.acked).toBe(1)
    expect(mockAcknowledgeOrder).toHaveBeenCalledWith('order-2', 'tok')
    expect((await getDb().orderAckQueue.get('order-2'))?.status).toBe('acked')
    // Nothing left pending.
    expect(await getPendingOrderAcks()).toHaveLength(0)
  })

  it('leaves a transient failure (network / 5xx) PENDING for the next cycle', async () => {
    mockAcknowledgeOrder.mockRejectedValue(new Error('tRPC lab.acknowledgeOrder failed: 503'))
    await enqueueOrderAck('order-3')

    const res = await drainOrderAckQueue(token)

    expect(res.failed).toBe(1)
    const entry = await getDb().orderAckQueue.get('order-3')
    expect(entry?.status).toBe('pending')       // still retryable
    expect(entry?.retryCount).toBe(1)
    expect(await getFailedOrderAcks()).toHaveLength(0)
  })

  it('dead-letters a permanent 4xx failure (surfaced in the failed-sync UI)', async () => {
    mockAcknowledgeOrder.mockRejectedValue(new Error('tRPC lab.acknowledgeOrder failed: 404'))
    await enqueueOrderAck('order-4')

    const res = await drainOrderAckQueue(token)

    expect(res.failed).toBe(1)
    const failed = await getFailedOrderAcks()
    expect(failed.map((f) => f.orderId)).toContain('order-4')
    expect(failed[0]?.status).toBe('failed')
    // A categorized reason is stored — never raw server text.
    expect(typeof failed[0]?.failureReason).toBe('string')
  })

  it('retries a dead-lettered ack when it is reset to pending', async () => {
    mockAcknowledgeOrder.mockRejectedValueOnce(new Error('tRPC lab.acknowledgeOrder failed: 404'))
    await enqueueOrderAck('order-5')
    await drainOrderAckQueue(token) // → failed
    expect((await getDb().orderAckQueue.get('order-5'))?.status).toBe('failed')

    const { retryOrderAck } = await import('../lib/db')
    await retryOrderAck('order-5')
    mockAcknowledgeOrder.mockResolvedValue(undefined)
    const res = await drainOrderAckQueue(token)

    expect(res.acked).toBe(1)
    expect((await getDb().orderAckQueue.get('order-5'))?.status).toBe('acked')
  })
})
