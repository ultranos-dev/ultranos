import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { clearPhiTables, verifyPhiCleanup, purgeSyncedQueueEntries, PHI_TABLES, PRESERVE_TABLES } from '@/lib/phi-cleanup'

// ---------------------------------------------------------------------------
// Minimal Dexie mock that records which tables were cleared
// ---------------------------------------------------------------------------
const clearedTables: string[] = []
const tableCounts: Record<string, number> = {}

// Track deletions from syncQueue by status
const deletedQueueStatuses: string[] = []

vi.mock('@/lib/db', () => {
  const makeFakeTable = (name: string) => ({
    clear: vi.fn().mockImplementation(() => {
      clearedTables.push(name)
      tableCounts[name] = 0
      return Promise.resolve()
    }),
    count: vi.fn().mockImplementation(() => Promise.resolve(tableCounts[name] ?? 0)),
    where: vi.fn().mockImplementation((field: string) => ({
      equals: vi.fn().mockImplementation((value: string) => ({
        delete: vi.fn().mockImplementation(() => {
          if (name === 'syncQueue') deletedQueueStatuses.push(value)
          return Promise.resolve(1)
        }),
      })),
    })),
  })

  // Build a mock db with all tables from the real schema
  const tables: Record<string, ReturnType<typeof makeFakeTable>> = {}
  const allTableNames = [
    'dispenses', 'dispenseAuditLog', 'patients',
    'syncQueue', 'practitionerKeys', 'revokedKeys',
    'pendingAuditEvents', 'clientAuditLog', 'catalogItems',
    'stockBatches', 'stockMovements', 'goodsReceipts',
    'pharmacySettings', 'invoices', 'payments', 'ledgerEntries',
    'patientAccounts', 'cashDrawers', 'suppliers',
    'purchaseOrders', 'stockCounts', 'stockTransfers',
    'dataBudgetConfig', 'dataUsage',
  ]
  for (const name of allTableNames) {
    tables[name] = makeFakeTable(name)
  }

  return {
    db: {
      table: (name: string) => {
        const t = tables[name]
        if (!t) throw new Error(`No such table: ${name}`)
        return t
      },
      syncQueue: {
        where: tables['syncQueue']!.where,
      },
    },
  }
})

describe('phi-cleanup (pharmacy-lite)', () => {
  beforeEach(() => {
    clearedTables.length = 0
    deletedQueueStatuses.length = 0
    // Seed some data in PHI tables
    for (const t of PHI_TABLES) {
      tableCounts[t] = 5
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('PHI_TABLES constant', () => {
    it('contains the encrypted PHI tables', () => {
      expect(PHI_TABLES).toContain('dispenses')
      expect(PHI_TABLES).toContain('dispenseAuditLog')
      expect(PHI_TABLES).toContain('patients')
    })

    it('does NOT contain syncQueue', () => {
      expect(PHI_TABLES).not.toContain('syncQueue')
    })

    it('does NOT contain clientAuditLog', () => {
      expect(PHI_TABLES).not.toContain('clientAuditLog')
    })
  })

  describe('PRESERVE_TABLES constant', () => {
    it('preserves syncQueue', () => {
      expect(PRESERVE_TABLES).toContain('syncQueue')
    })

    it('preserves clientAuditLog', () => {
      expect(PRESERVE_TABLES).toContain('clientAuditLog')
    })

    it('has no overlap with PHI_TABLES', () => {
      const phiSet = new Set(PHI_TABLES)
      for (const t of PRESERVE_TABLES) {
        expect(phiSet.has(t)).toBe(false)
      }
    })
  })

  describe('clearPhiTables()', () => {
    it('clears every table in PHI_TABLES', async () => {
      await clearPhiTables()
      for (const t of PHI_TABLES) {
        expect(clearedTables).toContain(t)
      }
    })

    it('does NOT clear syncQueue', async () => {
      await clearPhiTables()
      expect(clearedTables).not.toContain('syncQueue')
    })

    it('does NOT clear clientAuditLog', async () => {
      await clearPhiTables()
      expect(clearedTables).not.toContain('clientAuditLog')
    })

    it('resolves without throwing even if a table clear fails', async () => {
      const { db } = await import('@/lib/db')
      vi.spyOn(db.table('dispenses'), 'clear').mockRejectedValueOnce(new Error('fail'))
      await expect(clearPhiTables()).resolves.toBeUndefined()
    })
  })

  describe('purgeSyncedQueueEntries()', () => {
    it('deletes only "synced" status entries from syncQueue', async () => {
      await purgeSyncedQueueEntries()
      expect(deletedQueueStatuses).toContain('synced')
    })

    it('does not delete "pending" entries', async () => {
      await purgeSyncedQueueEntries()
      expect(deletedQueueStatuses).not.toContain('pending')
      expect(deletedQueueStatuses).not.toContain('failed')
    })

    it('resolves without throwing if delete fails', async () => {
      const { db } = await import('@/lib/db')
      vi.spyOn(db.syncQueue, 'where').mockImplementationOnce(() => {
        throw new Error('DB unavailable')
      })
      await expect(purgeSyncedQueueEntries()).resolves.toBeUndefined()
    })
  })

  describe('verifyPhiCleanup()', () => {
    it('returns true when all PHI tables are empty', async () => {
      for (const t of PHI_TABLES) {
        tableCounts[t] = 0
      }
      const result = await verifyPhiCleanup()
      expect(result).toBe(true)
    })

    it('returns false when any PHI table has rows', async () => {
      tableCounts['patients'] = 3
      const result = await verifyPhiCleanup()
      expect(result).toBe(false)
    })

    it('returns true after clearPhiTables()', async () => {
      await clearPhiTables()
      const result = await verifyPhiCleanup()
      expect(result).toBe(true)
    })

    it('returns false (assume dirty) when count throws', async () => {
      const { db } = await import('@/lib/db')
      vi.spyOn(db.table('patients'), 'count').mockRejectedValueOnce(new Error('DB error'))
      const result = await verifyPhiCleanup()
      expect(result).toBe(false)
    })
  })
})
