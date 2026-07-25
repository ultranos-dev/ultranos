/**
 * Tests for Story 28.3 Task 6:
 * migrateUnencryptedQueueEntries -- encrypts plaintext entries in-place.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { db } from "../lib/db"

const PLAINTEXT = JSON.stringify({ id: "enc-1" })

beforeEach(async () => {
  await db.syncQueue.clear()
  vi.resetModules()
})

function makeEntry(id: string, payload: string, status = "pending") {
  return {
    id,
    resourceType: "Encounter",
    resourceId: id,
    action: "create" as const,
    payload,
    status: status as "pending" | "failed" | "awaiting-key" | "synced",
    hlcTimestamp: "0:0:node",
    createdAt: new Date().toISOString(),
    retryCount: 0,
  }
}

describe("migrateUnencryptedQueueEntries", () => {
  it("does nothing when key is unavailable", async () => {
    vi.doMock("../lib/encryption-key-store", () => ({
      encryptionKeyStore: { getKey: () => null },
    }))
    vi.doMock("@ultranos/crypto", () => ({
      encryptPayload: vi.fn(),
    }))

    await db.syncQueue.add(makeEntry("e1", PLAINTEXT))

    const { migrateUnencryptedQueueEntries } = await import("../lib/sync-queue-migration")
    await migrateUnencryptedQueueEntries()

    const entries = await db.syncQueue.toArray()
    expect(entries[0]!.payload).toBe(PLAINTEXT)
  })

  it("encrypts plaintext entries when key is available", async () => {
    const fakeKey = {} as CryptoKey
    vi.doMock("../lib/encryption-key-store", () => ({
      encryptionKeyStore: { getKey: () => fakeKey },
    }))
    vi.doMock("@ultranos/crypto", () => ({
      // encryptPayload returns a version-prefixed string "v<N>:<base64>" per the crypto package contract.
      // The migration prepends "enc:" via ENCRYPTED_PAYLOAD_PREFIX, yielding "enc:v1:<base64>".
      encryptPayload: vi.fn().mockResolvedValue("v1:ENCRYPTED_BASE64"),
    }))

    await db.syncQueue.add(makeEntry("e1", PLAINTEXT))

    const { migrateUnencryptedQueueEntries } = await import("../lib/sync-queue-migration")
    await migrateUnencryptedQueueEntries()

    const entries = await db.syncQueue.toArray()
    expect(entries[0]!.payload).toBe("enc:v1:ENCRYPTED_BASE64")
  })

  it("skips already-encrypted entries", async () => {
    const fakeKey = {} as CryptoKey
    const encryptPayloadMock = vi.fn()
    vi.doMock("../lib/encryption-key-store", () => ({
      encryptionKeyStore: { getKey: () => fakeKey },
    }))
    vi.doMock("@ultranos/crypto", () => ({
      encryptPayload: encryptPayloadMock,
    }))

    await db.syncQueue.add(makeEntry("e1", "enc:v1:ALREADYENCRYPTED"))

    const { migrateUnencryptedQueueEntries } = await import("../lib/sync-queue-migration")
    await migrateUnencryptedQueueEntries()

    expect(encryptPayloadMock).not.toHaveBeenCalled()
    const entries = await db.syncQueue.toArray()
    expect(entries[0]!.payload).toBe("enc:v1:ALREADYENCRYPTED")
  })

  it("never throws even if key store throws", async () => {
    vi.doMock("../lib/encryption-key-store", () => ({
      encryptionKeyStore: {
        getKey: () => { throw new Error("key store error") },
      },
    }))

    const { migrateUnencryptedQueueEntries } = await import("../lib/sync-queue-migration")
    await expect(migrateUnencryptedQueueEntries()).resolves.toBeUndefined()
  })
})
