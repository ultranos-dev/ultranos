import { describe, it, expect, beforeEach } from 'vitest'
import { dexieKrlStorage } from '@/lib/krl-storage-adapter'
import { db } from '@/lib/db'

describe('dexieKrlStorage', () => {
  beforeEach(async () => {
    await db.revokedKeys.clear()
  })

  describe('getAll', () => {
    it('returns empty array when no entries exist', async () => {
      const result = await dexieKrlStorage.getAll()
      expect(result).toEqual([])
    })

    it('returns all stored entries', async () => {
      const entries = [
        { publicKey: 'key-a', revokedAt: '2026-01-01T00:00:00Z' },
        { publicKey: 'key-b', revokedAt: '2026-01-02T00:00:00Z' },
      ]
      await db.revokedKeys.bulkPut(entries)

      const result = await dexieKrlStorage.getAll()
      expect(result).toHaveLength(2)
      expect(result).toEqual(expect.arrayContaining(entries))
    })
  })

  describe('replaceAll', () => {
    it('replaces all entries atomically', async () => {
      await db.revokedKeys.bulkPut([
        { publicKey: 'old-key', revokedAt: '2026-01-01T00:00:00Z' },
      ])

      const newEntries = [
        { publicKey: 'new-key-1', revokedAt: '2026-02-01T00:00:00Z' },
        { publicKey: 'new-key-2', revokedAt: '2026-02-02T00:00:00Z' },
      ]
      await dexieKrlStorage.replaceAll(newEntries)

      const result = await db.revokedKeys.toArray()
      expect(result).toHaveLength(2)
      expect(result.map((e) => e.publicKey).sort()).toEqual(['new-key-1', 'new-key-2'])
    })

    it('clears all entries when given empty array', async () => {
      await db.revokedKeys.bulkPut([
        { publicKey: 'key-x', revokedAt: '2026-01-01T00:00:00Z' },
      ])

      await dexieKrlStorage.replaceAll([])

      const result = await db.revokedKeys.toArray()
      expect(result).toHaveLength(0)
    })
  })

  describe('has', () => {
    it('returns true for existing key', async () => {
      await db.revokedKeys.put({ publicKey: 'revoked-key', revokedAt: '2026-01-01T00:00:00Z' })

      const result = await dexieKrlStorage.has('revoked-key')
      expect(result).toBe(true)
    })

    it('returns false for non-existent key', async () => {
      const result = await dexieKrlStorage.has('unknown-key')
      expect(result).toBe(false)
    })
  })
})
