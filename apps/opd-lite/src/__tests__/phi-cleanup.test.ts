import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../lib/db'

// Minimal FHIR-shaped stubs for seeding PHI tables
function seedId(prefix: string, i: number) {
  return `${prefix}-${i}`
}

describe('phi-cleanup', () => {
  beforeEach(async () => {
    // Clear all tables before each test
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  describe('clearPhiTables', () => {
    it('clears all PHI tables', async () => {
      const { clearPhiTables } = await import('../lib/phi-cleanup')

      // Seed PHI tables with minimal records
      await db.patients.add({ id: seedId('p', 1), resourceType: 'Patient' } as never)
      await db.encounters.add({ id: seedId('e', 1), resourceType: 'Encounter' } as never)
      await db.soapLedger.add({
        id: seedId('s', 1),
        encounterId: 'e-1',
        subjective: 'test',
        objective: 'test',
        assessorRef: 'p/1',
        hlcTimestamp: '0:0:node',
        createdAt: new Date().toISOString(),
      })
      await db.observations.add({ id: seedId('o', 1), resourceType: 'Observation' } as never)
      await db.conditions.add({ id: seedId('c', 1), resourceType: 'Condition' } as never)
      await db.medications.add({ id: seedId('m', 1), resourceType: 'MedicationRequest' } as never)
      await db.allergyIntolerances.add({ id: seedId('a', 1), resourceType: 'AllergyIntolerance' } as never)
      await db.medicationStatements.add({ id: seedId('ms', 1), resourceType: 'MedicationStatement' } as never)
      await db.interactionAuditLog.add({
        id: seedId('ia', 1),
        encounterId: 'e-1',
        patientId: 'p-1',
        medicationRequestId: 'm-1',
        medicationDisplay: 'Test Drug',
        checkResult: 'CLEAR',
        interactionsFound: 0,
        practitionerRef: 'pr/1',
        hlcTimestamp: '0:0:node',
        createdAt: new Date().toISOString(),
      })
      await db.practitionerKeys.add({
        publicKey: 'test-key-base64',
        practitionerId: 'pr-1',
        practitionerName: 'Dr Test',
        cachedAt: new Date().toISOString(),
      })
      await db.diagnosticReports.add({ id: seedId('dr', 1), resourceType: 'DiagnosticReport' } as never)
      await db.appointments.add({ id: seedId('apt', 1), status: 'booked', start: new Date().toISOString() } as never)
      await db.syncMeta.add({ patientId: 'p-1', lastSyncedAt: new Date().toISOString() } as never)

      // Verify all seeded
      expect(await db.patients.count()).toBe(1)
      expect(await db.encounters.count()).toBe(1)
      expect(await db.soapLedger.count()).toBe(1)
      expect(await db.observations.count()).toBe(1)
      expect(await db.conditions.count()).toBe(1)
      expect(await db.medications.count()).toBe(1)
      expect(await db.allergyIntolerances.count()).toBe(1)
      expect(await db.medicationStatements.count()).toBe(1)
      expect(await db.interactionAuditLog.count()).toBe(1)
      expect(await db.practitionerKeys.count()).toBe(1)
      expect(await db.diagnosticReports.count()).toBe(1)
      expect(await db.appointments.count()).toBe(1)
      expect(await db.syncMeta.count()).toBe(1)

      await clearPhiTables()

      // All PHI tables should be empty
      expect(await db.patients.count()).toBe(0)
      expect(await db.encounters.count()).toBe(0)
      expect(await db.soapLedger.count()).toBe(0)
      expect(await db.observations.count()).toBe(0)
      expect(await db.conditions.count()).toBe(0)
      expect(await db.medications.count()).toBe(0)
      expect(await db.allergyIntolerances.count()).toBe(0)
      expect(await db.medicationStatements.count()).toBe(0)
      expect(await db.interactionAuditLog.count()).toBe(0)
      expect(await db.practitionerKeys.count()).toBe(0)
      expect(await db.diagnosticReports.count()).toBe(0)
      expect(await db.appointments.count()).toBe(0)
      expect(await db.syncMeta.count()).toBe(0)
    })

    it('preserves syncQueue entries', async () => {
      const { clearPhiTables } = await import('../lib/phi-cleanup')

      await db.syncQueue.add({
        id: 'sq-1',
        resourceType: 'Patient',
        resourceId: 'p-1',
        action: 'CREATE',
        payload: '{}',
        status: 'pending',
        hlcTimestamp: '0:0:node',
        createdAt: new Date().toISOString(),
        retryCount: 0,
      })

      await clearPhiTables()

      expect(await db.syncQueue.count()).toBe(1)
    })

    it('preserves clientAuditLog entries', async () => {
      const { clearPhiTables } = await import('../lib/phi-cleanup')

      await db.clientAuditLog.add({
        id: 'cal-1',
        status: 'pending',
        queuedAt: new Date().toISOString(),
      } as never)

      await clearPhiTables()

      expect(await db.clientAuditLog.count()).toBe(1)
    })

    it('preserves vocabulary tables', async () => {
      const { clearPhiTables } = await import('../lib/phi-cleanup')

      await db.vocabularyMedications.add({
        code: 'RX001',
        display: 'Test Med',
        form: 'tablet',
        strength: '500mg',
        version: 1,
      })
      await db.vocabularyIcd10.add({
        code: 'A09',
        display: 'Gastroenteritis',
        version: 1,
      })
      await db.vocabularyInteractions.add({
        drugA: 'RX001',
        drugB: 'RX002',
        severity: 'major',
        description: 'Test interaction',
        version: 1,
      })

      await clearPhiTables()

      expect(await db.vocabularyMedications.count()).toBe(1)
      expect(await db.vocabularyIcd10.count()).toBe(1)
      expect(await db.vocabularyInteractions.count()).toBe(1)
    })
  })

  describe('PHI_TABLES safety', () => {
    it('syncQueue is not in the PHI tables list', async () => {
      const { PHI_TABLES } = await import('../lib/phi-cleanup')
      expect(PHI_TABLES).not.toContain('syncQueue')
    })

    it('clientAuditLog is not in the PHI tables list', async () => {
      const { PHI_TABLES } = await import('../lib/phi-cleanup')
      expect(PHI_TABLES).not.toContain('clientAuditLog')
    })

    it('vocabulary tables are not in the PHI tables list', async () => {
      const { PHI_TABLES } = await import('../lib/phi-cleanup')
      expect(PHI_TABLES).not.toContain('vocabularyMedications')
      expect(PHI_TABLES).not.toContain('vocabularyIcd10')
      expect(PHI_TABLES).not.toContain('vocabularyInteractions')
    })

    it('PHI_TABLES + PRESERVE_TABLES covers every Dexie table', async () => {
      const { PHI_TABLES, PRESERVE_TABLES } = await import('../lib/phi-cleanup')
      const allDbTables = db.tables.map((t) => t.name).sort()
      const allClassifiedTables = [...PHI_TABLES, ...PRESERVE_TABLES].sort()
      expect(allClassifiedTables).toEqual(allDbTables)
    })
  })

  describe('verifyPhiCleanup', () => {
    it('returns true when all PHI tables are empty', async () => {
      const { verifyPhiCleanup } = await import('../lib/phi-cleanup')
      const result = await verifyPhiCleanup()
      expect(result).toBe(true)
    })

    it('returns false when PHI tables have stale data', async () => {
      const { verifyPhiCleanup } = await import('../lib/phi-cleanup')

      await db.patients.add({ id: 'stale-1', resourceType: 'Patient' } as never)

      const result = await verifyPhiCleanup()
      expect(result).toBe(false)
    })
  })
})
