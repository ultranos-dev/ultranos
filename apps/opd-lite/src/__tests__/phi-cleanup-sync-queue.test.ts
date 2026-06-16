/**
 * Tests for Story 28.3 Task 5:
 * clearSyncedQueueEntries -- deletes synced, retains pending/failed/awaiting-key.
 */

import { describe, it, expect, beforeEach } from "vitest"
import { db } from "../lib/db"
import { clearSyncedQueueEntries } from "../lib/phi-cleanup"

beforeEach(async () => {
  await db.syncQueue.clear()
})

function makeEntry(id: string, status: string, resourceId: string) {
  return {
    id,
    resourceType: "Encounter",
    resourceId,
    action: "create" as const,
    payload: "enc:v1:ciphertext",
    status: status as "pending" | "synced" | "failed" | "awaiting-key",
    hlcTimestamp: "0:0:node",
    createdAt: new Date().toISOString(),
    retryCount: 0,
  }
}

describe("clearSyncedQueueEntries", () => {
  it("deletes synced entries", async () => {
    await db.syncQueue.add(makeEntry("e1", "synced", "r1"))
    await clearSyncedQueueEntries()
    expect(await db.syncQueue.count()).toBe(0)
  })

  it("retains pending entries", async () => {
    await db.syncQueue.add(makeEntry("e1", "pending", "r1"))
    await clearSyncedQueueEntries()
    const remaining = await db.syncQueue.toArray()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.status).toBe("pending")
  })

  it("retains failed entries", async () => {
    await db.syncQueue.add(makeEntry("e1", "failed", "r1"))
    await clearSyncedQueueEntries()
    expect(await db.syncQueue.count()).toBe(1)
  })

  it("retains awaiting-key entries", async () => {
    await db.syncQueue.add(makeEntry("e1", "awaiting-key", "r1"))
    await clearSyncedQueueEntries()
    const remaining = await db.syncQueue.toArray()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.status).toBe("awaiting-key")
  })

  it("only deletes synced, retaining all other statuses", async () => {
    await db.syncQueue.add(makeEntry("e1", "synced", "r1"))
    await db.syncQueue.add(makeEntry("e2", "pending", "r2"))
    await db.syncQueue.add(makeEntry("e3", "failed", "r3"))
    await db.syncQueue.add(makeEntry("e4", "awaiting-key", "r4"))

    await clearSyncedQueueEntries()

    const remaining = await db.syncQueue.toArray()
    expect(remaining).toHaveLength(3)
    const statuses = remaining.map((e) => e.status).sort()
    expect(statuses).toEqual(["awaiting-key", "failed", "pending"])
  })

  it("is a no-op when there are no synced entries", async () => {
    await db.syncQueue.add(makeEntry("e1", "pending", "r1"))
    await clearSyncedQueueEntries()
    expect(await db.syncQueue.count()).toBe(1)
  })

  it("never throws", async () => {
    await expect(clearSyncedQueueEntries()).resolves.toBeUndefined()
  })
})
