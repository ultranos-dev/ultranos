import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { clearPhiTables, verifyPhiCleanup, PHI_TABLES, PRESERVE_TABLES } from '@/lib/phi-cleanup'

// ---------------------------------------------------------------------------
// Minimal mock for getDb() that records which tables were cleared.
// ALL_TABLE_NAMES is inlined inside the factory because vi.mock is hoisted
// to the top of the file and cannot reference module-level variables.
// ---------------------------------------------------------------------------
const clearedTables: string[] = []
const tableCounts: Record<string, number> = {}

vi.mock('@/lib/db', () => {
  // Table names are inlined inside the factory (cannot reference outer const —
  // vi.mock factories are hoisted before module-level const declarations).
  // Closures over clearedTables / tableCounts work fine: the factory only runs
  // lazily when the module is first imported, by which point those vars are live.
  const makeFakeTable = (name: string) => ({
    clear: vi.fn().mockImplementation(() => {
      clearedTables.push(name)
      tableCounts[name] = 0
      return Promise.resolve()
    }),
    count: vi.fn().mockImplementation(() => Promise.resolve(tableCounts[name] ?? 0)),
  })

  const tables: Record<string, ReturnType<typeof makeFakeTable>> = {}
  for (const n of [
    'uploadQueue', 'verified_patients', 'patientVerifications', 'samples',
    'orders', 'queueEntries', 'consentRecords', 'payments', 'culturalPreferences',
    'familyDelegates', 'smsQueue', 'lab_results', 'lab_observations',
    'amendments', 'labLogbook', 'chw_samples',
    'syncQueue', 'clientAuditLog', 'practitioner_keys',
    'reagent_inventory', 'reagent_consumption_log',
    'sops', 'sop_acknowledgments', 'micro_learning_modules', 'module_completions',
    'dataBudgetConfig', 'dataUsage',
  ]) {
    tables[n] = makeFakeTable(n)
  }

  return {
    getDb: () => ({
      table: (name: string) => {
        const t = tables[name]
        if (!t) throw new Error(`No such table: ${name}`)
        return t
      },
    }),
  }
})

describe('phi-cleanup (lab-lite)', () => {
  beforeEach(() => {
    clearedTables.length = 0
    for (const t of PHI_TABLES) {
      tableCounts[t] = 5
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('PHI_TABLES constant', () => {
    it('contains the patient-data tables', () => {
      expect(PHI_TABLES).toContain('uploadQueue')
      expect(PHI_TABLES).toContain('verified_patients')
      expect(PHI_TABLES).toContain('queueEntries')
      expect(PHI_TABLES).toContain('consentRecords')
      expect(PHI_TABLES).toContain('familyDelegates')
      expect(PHI_TABLES).toContain('smsQueue')
      expect(PHI_TABLES).toContain('lab_results')
      expect(PHI_TABLES).toContain('labLogbook')
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
      const { getDb } = await import('@/lib/db')
      vi.spyOn(getDb().table('uploadQueue'), 'clear').mockRejectedValueOnce(new Error('fail'))
      await expect(clearPhiTables()).resolves.toBeUndefined()
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
      tableCounts['verified_patients'] = 2
      const result = await verifyPhiCleanup()
      expect(result).toBe(false)
    })

    it('returns true after clearPhiTables()', async () => {
      await clearPhiTables()
      const result = await verifyPhiCleanup()
      expect(result).toBe(true)
    })

    it('returns false (assume dirty) when count throws', async () => {
      const { getDb } = await import('@/lib/db')
      vi.spyOn(getDb().table('queueEntries'), 'count').mockRejectedValueOnce(new Error('DB error'))
      const result = await verifyPhiCleanup()
      expect(result).toBe(false)
    })
  })
})
