/**
 * Tests for Story 28.3 DrainWorker encryption integration:
 * - decryptFn called before syncFn for encrypted entries
 * - decrypted payload never persisted back to storage
 * - awaiting-key set when isKeyAvailable returns false
 * - legacy plaintext entries drain correctly (backward compat)
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { DrainWorker, type SyncResult } from "../drain-worker.js"
import {
  createSyncQueue,
  ENCRYPTED_PAYLOAD_PREFIX,
  type SyncQueueEntry,
  type SyncQueueStorage,
} from "../queue.js"

function createInMemoryStorage(): SyncQueueStorage & { entries: SyncQueueEntry[] } {
  const storage = {
    entries: [] as SyncQueueEntry[],
    async put(entry: SyncQueueEntry) {
      const idx = storage.entries.findIndex((e) => e.id === entry.id)
      if (idx >= 0) storage.entries[idx] = entry
      else storage.entries.push(entry)
    },
    async getByResourceId(resourceId: string, status: string) {
      return storage.entries.find((e) => e.resourceId === resourceId && e.status === status) ?? null
    },
    async getByStatus(status: string) {
      return storage.entries.filter((e) => e.status === status)
    },
    async delete(id: string) {
      storage.entries = storage.entries.filter((e) => e.id !== id)
    },
    async count(status: string) {
      return storage.entries.filter((e) => e.status === status).length
    },
    async getLatestSynced() { return null },
  }
  return storage
}

const PLAINTEXT = JSON.stringify({ id: "enc-1" })

describe("DrainWorker with encryption", () => {
  let storage: ReturnType<typeof createInMemoryStorage>
  let queue: ReturnType<typeof createSyncQueue>

  beforeEach(() => {
    storage = createInMemoryStorage()
    queue = createSyncQueue(storage)
  })

  it("calls decryptFn before syncFn for encrypted entries", async () => {
    const encryptedPayload = ENCRYPTED_PAYLOAD_PREFIX + "FAKECIPHERTEXT"

    await queue.enqueue({
      resourceType: "Encounter",
      resourceId: "enc-1",
      action: "create",
      payload: encryptedPayload,
      hlcTimestamp: "000001700000000:00000:node-1",
    })

    const decryptFn = vi.fn().mockResolvedValue(PLAINTEXT)
    const syncFn = vi.fn<(e: SyncQueueEntry) => Promise<SyncResult>>().mockResolvedValue({ success: true })

    const worker = new DrainWorker({ queue, syncFn, decryptFn, isKeyAvailable: () => true })
    await worker.drain()

    expect(decryptFn).toHaveBeenCalledWith(encryptedPayload)
    expect(syncFn).toHaveBeenCalledWith(
      expect.objectContaining({ payload: PLAINTEXT }),
    )
  })

  it("decrypted payload is never written back to storage", async () => {
    const encryptedPayload = ENCRYPTED_PAYLOAD_PREFIX + "CIPHER"

    await queue.enqueue({
      resourceType: "Encounter",
      resourceId: "enc-1",
      action: "create",
      payload: encryptedPayload,
      hlcTimestamp: "000001700000000:00000:node-1",
    })

    const decryptFn = vi.fn().mockResolvedValue(PLAINTEXT)
    const syncFn = vi.fn<(e: SyncQueueEntry) => Promise<SyncResult>>().mockResolvedValue({ success: true })

    const worker = new DrainWorker({ queue, syncFn, decryptFn, isKeyAvailable: () => true })
    await worker.drain()

    const synced = await storage.getByStatus("synced")
    expect(synced).toHaveLength(1)
    expect(synced[0]!.payload).toBe(encryptedPayload)
  })

  it("sets entry to awaiting-key when isKeyAvailable returns false", async () => {
    const encryptedPayload = ENCRYPTED_PAYLOAD_PREFIX + "CIPHER"

    await queue.enqueue({
      resourceType: "Encounter",
      resourceId: "enc-1",
      action: "create",
      payload: encryptedPayload,
      hlcTimestamp: "000001700000000:00000:node-1",
    })

    const decryptFn = vi.fn()
    const syncFn = vi.fn<(e: SyncQueueEntry) => Promise<SyncResult>>()

    const worker = new DrainWorker({ queue, syncFn, decryptFn, isKeyAvailable: () => false })
    await worker.drain()

    expect(syncFn).not.toHaveBeenCalled()
    expect(decryptFn).not.toHaveBeenCalled()

    const awaitingKey = await storage.getByStatus("awaiting-key")
    expect(awaitingKey).toHaveLength(1)
    expect(awaitingKey[0]!.resourceId).toBe("enc-1")
  })

  it("drains legacy plaintext entries regardless of key availability", async () => {
    await queue.enqueue({
      resourceType: "Encounter",
      resourceId: "enc-1",
      action: "create",
      payload: PLAINTEXT,
      hlcTimestamp: "000001700000000:00000:node-1",
    })

    const syncFn = vi.fn<(e: SyncQueueEntry) => Promise<SyncResult>>().mockResolvedValue({ success: true })
    const worker = new DrainWorker({ queue, syncFn, isKeyAvailable: () => false })
    await worker.drain()

    expect(syncFn).toHaveBeenCalledWith(expect.objectContaining({ payload: PLAINTEXT }))
    expect(await queue.getPending()).toHaveLength(0)
  })

  it("after restoreAwaitingKeyEntries, entries drain on next cycle", async () => {
    const encryptedPayload = ENCRYPTED_PAYLOAD_PREFIX + "CIPHER"

    await queue.enqueue({
      resourceType: "Encounter",
      resourceId: "enc-1",
      action: "create",
      payload: encryptedPayload,
      hlcTimestamp: "000001700000000:00000:node-1",
    })

    const decryptFn = vi.fn().mockResolvedValue(PLAINTEXT)
    const syncFn = vi.fn<(e: SyncQueueEntry) => Promise<SyncResult>>().mockResolvedValue({ success: true })

    const worker1 = new DrainWorker({ queue, syncFn, decryptFn, isKeyAvailable: () => false })
    await worker1.drain()
    expect(await storage.getByStatus("awaiting-key")).toHaveLength(1)

    await queue.restoreAwaitingKeyEntries()
    expect(await storage.getByStatus("awaiting-key")).toHaveLength(0)

    const worker2 = new DrainWorker({ queue, syncFn, decryptFn, isKeyAvailable: () => true })
    await worker2.drain()

    expect(syncFn).toHaveBeenCalledOnce()
    expect(await storage.getByStatus("synced")).toHaveLength(1)
  })
})
