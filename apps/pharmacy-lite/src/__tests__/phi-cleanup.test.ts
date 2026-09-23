import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  clearPhiTables,
  verifyPhiCleanup,
  purgeSyncedQueueEntries,
  preserveUnsyncedDispenses,
  PHI_TABLES,
  PRESERVE_TABLES,
  BLANKET_CLEAR_PHI_TABLES,
  SELECTIVE_CLEAR_TABLES,
} from '@/lib/phi-cleanup'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import type { LocalMedicationDispense } from '@/lib/medication-dispense'
import type { SyncQueueEntry } from '@/lib/db'

function makeDispense(id: string): LocalMedicationDispense {
  return {
    id,
    resourceType: 'MedicationDispense',
    status: 'completed',
    medicationCodeableConcept: {
      coding: [{ system: 'urn:ultranos:medication', code: 'AMX500', display: 'Amoxicillin' }],
      text: 'Amoxicillin 500mg Capsule',
    },
    subject: { reference: 'Patient/pat-001' },
    performer: [{ actor: { reference: 'Practitioner/practitioner-abc-123' } }],
    authorizingPrescription: [{ reference: `MedicationRequest/rx-${id}` }],
    whenHandedOver: '2026-05-12T10:00:00Z',
    dosageInstruction: [{ text: '1 capsule, 3x per day, for 7 days' }],
    _ultranos: {
      hlcTimestamp: '000001714400000:00000:node-abc',
      createdAt: '2026-05-12T10:00:00Z',
      isOfflineCreated: false,
    },
    meta: { lastUpdated: '2026-05-12T10:00:00Z', versionId: '1' },
  }
}

function makeQueueEntry(dispenseId: string, status: SyncQueueEntry['status']): SyncQueueEntry {
  return {
    id: `q-${dispenseId}-${status}`,
    resourceType: 'MedicationDispense',
    resourceId: dispenseId,
    action: 'dispense_sync',
    payload: '{}',
    status,
    hlcTimestamp: '000001714400000:00000:node-abc',
    createdAt: '2026-05-12T10:00:00Z',
    retryCount: 0,
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  encryptionKeyStore.setKey(key)
})

afterEach(() => {
  encryptionKeyStore.wipe()
  vi.clearAllMocks()
})

describe('phi-cleanup (pharmacy-lite)', () => {
  describe('PHI_TABLES / PRESERVE_TABLES constants', () => {
    it('contains the encrypted PHI tables', () => {
      expect(PHI_TABLES).toContain('dispenses')
      expect(PHI_TABLES).toContain('dispenseAuditLog')
      expect(PHI_TABLES).toContain('patients')
    })

    it('contains the cached hub allergy table (Story 57.1) as a blanket-clear cache', () => {
      // Story 57.1: patientAllergyCache holds fetched allergy substances (PHI) —
      // it is a cache, safe to blanket-clear on session end (not selective-preserve).
      expect(PHI_TABLES).toContain('patientAllergyCache')
      expect((BLANKET_CLEAR_PHI_TABLES as readonly string[])).toContain('patientAllergyCache')
      expect((SELECTIVE_CLEAR_TABLES as readonly string[])).not.toContain('patientAllergyCache')
    })

    it('does NOT contain syncQueue or clientAuditLog', () => {
      expect(PHI_TABLES).not.toContain('syncQueue')
      expect(PHI_TABLES).not.toContain('clientAuditLog')
    })

    it('preserves syncQueue and clientAuditLog', () => {
      expect(PRESERVE_TABLES).toContain('syncQueue')
      expect(PRESERVE_TABLES).toContain('clientAuditLog')
    })

    it('has no overlap between PHI_TABLES and PRESERVE_TABLES', () => {
      const phiSet = new Set<string>(PHI_TABLES)
      for (const t of PRESERVE_TABLES) expect(phiSet.has(t)).toBe(false)
    })

    it('selective-clear tables are NOT in the blanket-clear list (Story 57.3 guard)', () => {
      for (const t of SELECTIVE_CLEAR_TABLES) {
        expect((BLANKET_CLEAR_PHI_TABLES as readonly string[])).not.toContain(t)
      }
      expect(BLANKET_CLEAR_PHI_TABLES).toContain('patients')
    })
  })

  describe('clearPhiTables() — blanket tables', () => {
    it('clears patients but preserves an unsynced dispense (Story 57.3 AC #2)', async () => {
      await db.patients.put({ id: 'p1', nameGiven: 'X', gender: 'unknown', createdAt: 'now', source: 'registered' })
      await db.dispenses.put(makeDispense('d-unsynced'))
      // No synced queue entry for it → unsynced → must be preserved.

      await clearPhiTables()

      expect(await db.patients.count()).toBe(0)
      const remaining = await db.dispenses.toArray()
      expect(remaining.map((d) => d.id)).toContain('d-unsynced')
    })

    it('clears the cached hub allergy table (Story 57.1 patientAllergyCache)', async () => {
      await db.patientAllergyCache.put({
        patientRef: 'pat-001',
        allergies: ['penicillin'],
        fetchedAt: '2026-05-12T10:00:00Z',
      })

      await clearPhiTables()

      expect(await db.patientAllergyCache.count()).toBe(0)
    })

    it('does not throw if a blanket table clear fails', async () => {
      vi.spyOn(db.patients, 'clear').mockRejectedValueOnce(new Error('fail'))
      await expect(clearPhiTables()).resolves.toBeUndefined()
    })
  })

  describe('preserveUnsyncedDispenses() — Story 57.3 AC #2', () => {
    it('deletes ONLY dispenses with a synced queue entry, preserving unsynced ones', async () => {
      await db.dispenses.bulkPut([makeDispense('d-synced'), makeDispense('d-pending'), makeDispense('d-orphan')])
      await db.syncQueue.bulkPut([
        makeQueueEntry('d-synced', 'synced'),
        makeQueueEntry('d-pending', 'pending'),
        // d-orphan has NO queue entry at all
      ])

      await preserveUnsyncedDispenses()

      const ids = (await db.dispenses.toArray()).map((d) => d.id).sort()
      expect(ids).toEqual(['d-orphan', 'd-pending']) // synced one purged; unsynced preserved
    })

    it('preserves ALL dispenses when nothing is confirmed synced', async () => {
      await db.dispenses.bulkPut([makeDispense('d1'), makeDispense('d2')])
      await db.syncQueue.bulkPut([makeQueueEntry('d1', 'failed'), makeQueueEntry('d2', 'pending')])

      await preserveUnsyncedDispenses()

      expect(await db.dispenses.count()).toBe(2)
    })

    it('purges audit-log rows for synced dispenses, keeps rows for preserved ones', async () => {
      await db.dispenses.bulkPut([makeDispense('d-synced'), makeDispense('d-pending')])
      await db.dispenseAuditLog.bulkPut([
        { id: 'a1', dispenseId: 'd-synced', patientRef: 'Patient/p', medicationCode: 'AMX', medicationDisplay: 'Amox', pharmacistRef: 'Practitioner/x', action: 'created', hlcTimestamp: 'h', createdAt: 'now' },
        { id: 'a2', dispenseId: 'd-pending', patientRef: 'Patient/p', medicationCode: 'AMX', medicationDisplay: 'Amox', pharmacistRef: 'Practitioner/x', action: 'created', hlcTimestamp: 'h', createdAt: 'now' },
      ])
      await db.syncQueue.put(makeQueueEntry('d-synced', 'synced'))

      await preserveUnsyncedDispenses()

      const auditIds = (await db.dispenseAuditLog.toArray()).map((a) => a.id)
      expect(auditIds).toEqual(['a2'])
    })

    it('does not throw on DB error', async () => {
      vi.spyOn(db.syncQueue, 'where').mockImplementationOnce(() => {
        throw new Error('DB unavailable')
      })
      await expect(preserveUnsyncedDispenses()).resolves.toBeUndefined()
    })
  })

  describe('purgeSyncedQueueEntries()', () => {
    it('deletes only "synced" entries, keeps pending/failed', async () => {
      await db.syncQueue.bulkPut([
        makeQueueEntry('d1', 'synced'),
        makeQueueEntry('d2', 'pending'),
        makeQueueEntry('d3', 'failed'),
      ])

      await purgeSyncedQueueEntries()

      const statuses = (await db.syncQueue.toArray()).map((e) => e.status).sort()
      expect(statuses).toEqual(['failed', 'pending'])
    })

    it('resolves without throwing if delete fails', async () => {
      vi.spyOn(db.syncQueue, 'where').mockImplementationOnce(() => {
        throw new Error('DB unavailable')
      })
      await expect(purgeSyncedQueueEntries()).resolves.toBeUndefined()
    })
  })

  describe('verifyPhiCleanup()', () => {
    it('returns true when blanket PHI tables are empty even if an unsynced dispense remains', async () => {
      await db.dispenses.put(makeDispense('d-unsynced')) // preserved, non-empty
      const result = await verifyPhiCleanup()
      expect(result).toBe(true) // dispenses excluded from the blanket check
    })

    it('returns false when a blanket PHI table has rows', async () => {
      await db.patients.put({ id: 'p1', nameGiven: 'X', gender: 'unknown', createdAt: 'now', source: 'registered' })
      const result = await verifyPhiCleanup()
      expect(result).toBe(false)
    })

    it('returns true after clearPhiTables()', async () => {
      await db.patients.put({ id: 'p1', nameGiven: 'X', gender: 'unknown', createdAt: 'now', source: 'registered' })
      await clearPhiTables()
      expect(await verifyPhiCleanup()).toBe(true)
    })
  })
})
