import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  KRLSyncService,
  type KRLEntry,
  type KRLStorage,
} from '../krl-sync'
import { getSyncPriority, SYNC_PRIORITY } from '../sync-priority'

function makeStorage(): KRLStorage & { entries: KRLEntry[] } {
  const entries: KRLEntry[] = []
  return {
    entries,
    async getAll() {
      return [...entries]
    },
    async replaceAll(newEntries: KRLEntry[]) {
      entries.length = 0
      entries.push(...newEntries)
    },
    async has(publicKey: string) {
      return entries.some((e) => e.publicKey === publicKey)
    },
  }
}

describe('KRLSyncService', () => {
  let storage: ReturnType<typeof makeStorage>
  let service: KRLSyncService

  beforeEach(() => {
    storage = makeStorage()
    service = new KRLSyncService(storage)
  })

  it('applies a full KRL snapshot from the Hub (AC 3)', async () => {
    const krl: KRLEntry[] = [
      { publicKey: 'key-1', revokedAt: '2026-06-01T00:00:00Z' },
      { publicKey: 'key-2', revokedAt: '2026-06-02T00:00:00Z' },
    ]

    await service.applySnapshot(krl)

    expect(storage.entries).toHaveLength(2)
    expect(storage.entries[0]!.publicKey).toBe('key-1')
  })

  it('checks if a key is in the KRL (AC 4)', async () => {
    storage.entries.push({ publicKey: 'revoked-1', revokedAt: '2026-06-01T00:00:00Z' })

    expect(await service.isRevoked('revoked-1')).toBe(true)
    expect(await service.isRevoked('clean-key')).toBe(false)
  })

  it('processes incremental KRL updates', async () => {
    storage.entries.push({ publicKey: 'existing-1', revokedAt: '2026-05-01T00:00:00Z' })

    await service.addRevocation({ publicKey: 'new-revoked', revokedAt: '2026-06-01T00:00:00Z' })

    expect(storage.entries).toHaveLength(2)
    expect(await service.isRevoked('new-revoked')).toBe(true)
    expect(await service.isRevoked('existing-1')).toBe(true)
  })

  it('is idempotent for duplicate revocations', async () => {
    const entry: KRLEntry = { publicKey: 'dup-key', revokedAt: '2026-06-01T00:00:00Z' }

    await service.addRevocation(entry)
    await service.addRevocation(entry)

    expect(storage.entries).toHaveLength(1)
  })
})

describe('KRL sync priority', () => {
  it('KRL is classified as high-priority sync (same as allergies/consent)', () => {
    expect(SYNC_PRIORITY.KeyRevocationList).toBe(1)
    expect(getSyncPriority('KeyRevocationList')).toBe(1)
  })
})
