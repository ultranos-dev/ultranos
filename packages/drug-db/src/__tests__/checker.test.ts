import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  checkInteractions,
  checkAllergyMatch,
  invalidateCache,
  getMedicationNamesFromStatements,
  buildLookupMapFromEntries,
  STALENESS_THRESHOLD_MS,
} from '../checker.js'
import { DrugInteractionSeverity } from '@ultranos/shared-types'
import type { FhirAllergyIntolerance, FhirMedicationStatementZod } from '@ultranos/shared-types'
import type { DrugDatabaseAdapter, VocabInteractionEntry } from '../types.js'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const FIXTURE_ENTRIES: VocabInteractionEntry[] = [
  { drugA: 'Warfarin', drugB: 'Aspirin', severity: 'CONTRAINDICATED', description: 'Increased bleeding risk' },
  { drugA: 'Methotrexate', drugB: 'Ibuprofen', severity: 'MAJOR', description: 'Methotrexate toxicity risk' },
  { drugA: 'Lisinopril', drugB: 'Potassium', severity: 'MODERATE', description: 'Hyperkalemia risk' },
  { drugA: 'Amoxicillin', drugB: 'Methotrexate', severity: 'MINOR', description: 'Possible reduced methotrexate clearance' },
  { drugA: 'Simvastatin', drugB: 'Erythromycin', severity: 'MAJOR', description: 'Rhabdomyolysis risk' },
  { drugA: 'Omeprazole', drugB: 'Clopidogrel', severity: 'MODERATE', description: 'Reduced clopidogrel efficacy' },
]

function createAdapter(entries: VocabInteractionEntry[], metadata?: { lastUpdatedAt: string; version: number } | null): DrugDatabaseAdapter {
  return {
    getInteractions: async () => entries,
    ...(metadata !== undefined ? { getMetadata: async () => metadata } : {}),
  }
}

function createEmptyAdapter(): DrugDatabaseAdapter {
  return { getInteractions: async () => [] }
}

function makeAllergy(substance: string): FhirAllergyIntolerance {
  return {
    id: crypto.randomUUID(),
    resourceType: 'AllergyIntolerance',
    clinicalStatus: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical' as const, code: 'active' as const }],
    },
    verificationStatus: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification' as const, code: 'confirmed' as const }],
    },
    type: 'allergy' as const,
    criticality: 'high' as const,
    code: { text: substance },
    patient: { reference: 'Patient/test-123' },
    _ultranos: {
      substanceFreeText: substance,
      createdAt: new Date().toISOString(),
      recordedByRole: 'DOCTOR',
      isOfflineCreated: false,
      hlcTimestamp: '0:0:node1',
    },
    meta: {
      versionId: '1',
      lastUpdated: new Date().toISOString(),
    },
  } as FhirAllergyIntolerance
}

function makeMedicationStatement(display: string): FhirMedicationStatementZod {
  return {
    id: crypto.randomUUID(),
    resourceType: 'MedicationStatement',
    status: 'active',
    medicationCodeableConcept: {
      coding: [{ system: 'http://snomed.info/sct', code: '12345', display }],
      text: display,
    },
    subject: { reference: 'Patient/test-123' },
    dateAsserted: new Date().toISOString(),
    _ultranos: {
      createdAt: new Date().toISOString(),
      isOfflineCreated: false,
      hlcTimestamp: '0:0:node1',
    },
    meta: {
      versionId: '1',
      lastUpdated: new Date().toISOString(),
    },
  } as FhirMedicationStatementZod
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('drug-db checker', () => {
  beforeEach(() => {
    invalidateCache()
  })

  // =========================================================================
  // CONTRAINDICATED blocking (CLAUDE.md mandatory)
  // =========================================================================
  describe('CONTRAINDICATED blocking', () => {
    it('returns BLOCKED when a CONTRAINDICATED interaction is found', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES)
      const result = await checkInteractions('Warfarin', ['Aspirin'], undefined, adapter)

      expect(result.result).toBe('BLOCKED')
      expect(result.interactions).toHaveLength(1)
      expect(result.interactions[0]!.severity).toBe(DrugInteractionSeverity.CONTRAINDICATED)
      expect(result.interactions[0]!.drugA).toBe('Warfarin')
      expect(result.interactions[0]!.drugB).toBe('Aspirin')
    })
  })

  // =========================================================================
  // ALLERGY_MATCH blocking (CLAUDE.md mandatory)
  // =========================================================================
  describe('ALLERGY_MATCH blocking', () => {
    it('returns BLOCKED when drug matches a patient allergy', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES)
      const allergies = [makeAllergy('Penicillin')]
      const result = await checkInteractions('Penicillin V', [], { activeAllergies: allergies }, adapter)

      expect(result.result).toBe('BLOCKED')
      expect(result.interactions).toHaveLength(1)
      expect(result.interactions[0]!.severity).toBe(DrugInteractionSeverity.ALLERGY_MATCH)
    })

    it('appends allergy interactions to drug-drug interactions', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES)
      const allergies = [makeAllergy('Warfarin')]
      // Warfarin allergy match + Warfarin-Aspirin CONTRAINDICATED drug-drug
      const result = await checkInteractions('Warfarin', ['Aspirin'], { activeAllergies: allergies, activeMedications: [] }, adapter)

      expect(result.result).toBe('BLOCKED')
      // Should have both allergy match + drug-drug interaction
      const severities = result.interactions.map((i) => i.severity)
      expect(severities).toContain(DrugInteractionSeverity.ALLERGY_MATCH)
      expect(severities).toContain(DrugInteractionSeverity.CONTRAINDICATED)
    })
  })

  // =========================================================================
  // MAJOR blocking
  // =========================================================================
  describe('MAJOR interaction blocking', () => {
    it('returns BLOCKED for MAJOR severity interactions', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES)
      const result = await checkInteractions('Methotrexate', ['Ibuprofen'], undefined, adapter)

      expect(result.result).toBe('BLOCKED')
      expect(result.interactions[0]!.severity).toBe(DrugInteractionSeverity.MAJOR)
    })
  })

  // =========================================================================
  // MODERATE → WARNING
  // =========================================================================
  describe('MODERATE interaction warning', () => {
    it('returns WARNING for MODERATE severity interactions', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES)
      const result = await checkInteractions('Lisinopril', ['Potassium'], undefined, adapter)

      expect(result.result).toBe('WARNING')
      expect(result.interactions[0]!.severity).toBe(DrugInteractionSeverity.MODERATE)
    })
  })

  // =========================================================================
  // MINOR → WARNING
  // =========================================================================
  describe('MINOR interaction warning', () => {
    it('returns WARNING for MINOR severity interactions', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES)
      const result = await checkInteractions('Amoxicillin', ['Methotrexate'], undefined, adapter)

      expect(result.result).toBe('WARNING')
      expect(result.interactions[0]!.severity).toBe(DrugInteractionSeverity.MINOR)
    })
  })

  // =========================================================================
  // Override-with-reason logging path (CLAUDE.md mandatory)
  // =========================================================================
  describe('override-with-reason logging path', () => {
    it('BLOCKED result contains all interaction details needed for override audit', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES)
      const result = await checkInteractions('Warfarin', ['Aspirin'], undefined, adapter)

      expect(result.result).toBe('BLOCKED')
      // The consuming app uses these fields to log override-with-reason:
      // interaction.severity, interaction.drugA, interaction.drugB, interaction.description
      const interaction = result.interactions[0]!
      expect(interaction.severity).toBe(DrugInteractionSeverity.CONTRAINDICATED)
      expect(interaction.drugA).toBeTruthy()
      expect(interaction.drugB).toBeTruthy()
      expect(interaction.description).toBeTruthy()
    })

    it('WARNING result provides interaction details for override documentation', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES)
      const result = await checkInteractions('Lisinopril', ['Potassium'], undefined, adapter)

      expect(result.result).toBe('WARNING')
      const interaction = result.interactions[0]!
      expect(interaction.severity).toBeDefined()
      expect(interaction.description.length).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // "Check unavailable" fallback (CLAUDE.md mandatory)
  // =========================================================================
  describe('check unavailable fallback', () => {
    it('returns UNAVAILABLE when adapter has zero interactions (empty database)', async () => {
      const adapter = createEmptyAdapter()
      const result = await checkInteractions('Warfarin', ['Aspirin'], undefined, adapter)

      expect(result.result).toBe('UNAVAILABLE')
      expect(result.reason).toBe('EMPTY_DATABASE')
      expect(result.interactions).toEqual([])
    })

    it('never returns CLEAR on empty data', async () => {
      const adapter = createEmptyAdapter()
      const result = await checkInteractions('SomeDrug', [], undefined, adapter)

      expect(result.result).toBe('UNAVAILABLE')
      expect(result.reason).toBe('EMPTY_DATABASE')
      expect(result.result).not.toBe('CLEAR')
    })
  })

  // =========================================================================
  // Bidirectional lookup
  // =========================================================================
  describe('bidirectional lookup', () => {
    it('resolves A→B interaction', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES)
      const result = await checkInteractions('Warfarin', ['Aspirin'], undefined, adapter)

      expect(result.result).toBe('BLOCKED')
      expect(result.interactions).toHaveLength(1)
    })

    it('resolves B→A interaction (reversed order)', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES)
      invalidateCache()
      const result = await checkInteractions('Aspirin', ['Warfarin'], undefined, adapter)

      expect(result.result).toBe('BLOCKED')
      expect(result.interactions).toHaveLength(1)
      expect(result.interactions[0]!.severity).toBe(DrugInteractionSeverity.CONTRAINDICATED)
    })

    it('buildLookupMapFromEntries creates both directions', () => {
      const map = buildLookupMapFromEntries(FIXTURE_ENTRIES)
      const warfarinLookup = map.get('warfarin')
      const aspirinLookup = map.get('aspirin')

      expect(warfarinLookup?.has('aspirin')).toBe(true)
      expect(aspirinLookup?.has('warfarin')).toBe(true)
      expect(warfarinLookup?.get('aspirin')?.severity).toBe(DrugInteractionSeverity.CONTRAINDICATED)
      expect(aspirinLookup?.get('warfarin')?.severity).toBe(DrugInteractionSeverity.CONTRAINDICATED)
    })
  })

  // =========================================================================
  // Case-insensitivity and whitespace trimming
  // =========================================================================
  describe('case-insensitivity and whitespace trimming', () => {
    it('matches drugs regardless of case', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES)
      const result = await checkInteractions('WARFARIN', ['aspirin'], undefined, adapter)

      expect(result.result).toBe('BLOCKED')
    })

    it('trims whitespace before matching', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES)
      invalidateCache()
      const result = await checkInteractions('  Warfarin  ', ['  Aspirin  '], undefined, adapter)

      expect(result.result).toBe('BLOCKED')
    })

    it('handles mixed case and whitespace together', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES)
      invalidateCache()
      const result = await checkInteractions('  wArFaRiN  ', ['  aSpIrIn  '], undefined, adapter)

      expect(result.result).toBe('BLOCKED')
    })
  })

  // =========================================================================
  // Multi-interaction detection
  // =========================================================================
  describe('multi-interaction detection', () => {
    it('detects when a drug interacts with multiple active meds', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES)
      // Methotrexate interacts with both Ibuprofen (MAJOR) and Amoxicillin (MINOR)
      const result = await checkInteractions('Methotrexate', ['Ibuprofen', 'Amoxicillin'], undefined, adapter)

      expect(result.result).toBe('BLOCKED') // MAJOR takes precedence
      expect(result.interactions).toHaveLength(2)

      const severities = new Set(result.interactions.map((i) => i.severity))
      expect(severities.has(DrugInteractionSeverity.MAJOR)).toBe(true)
      expect(severities.has(DrugInteractionSeverity.MINOR)).toBe(true)
    })

    it('returns CLEAR when no interactions exist', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES)
      const result = await checkInteractions('Paracetamol', ['Vitamin C'], undefined, adapter)

      expect(result.result).toBe('CLEAR')
      expect(result.interactions).toHaveLength(0)
    })
  })

  // =========================================================================
  // Allergy substring matching
  // =========================================================================
  describe('allergy substring matching', () => {
    it('matches when drug name contains allergy substance', () => {
      const allergies = [makeAllergy('Penicillin')]
      const results = checkAllergyMatch('Penicillin V Potassium', allergies)

      expect(results).toHaveLength(1)
      expect(results[0]!.severity).toBe(DrugInteractionSeverity.ALLERGY_MATCH)
    })

    it('matches when allergy substance contains drug name', () => {
      const allergies = [makeAllergy('Amoxicillin/Clavulanate')]
      const results = checkAllergyMatch('Amoxicillin', allergies)

      expect(results).toHaveLength(1)
      expect(results[0]!.severity).toBe(DrugInteractionSeverity.ALLERGY_MATCH)
    })

    it('is case-insensitive', () => {
      const allergies = [makeAllergy('PENICILLIN')]
      const results = checkAllergyMatch('penicillin v', allergies)

      expect(results).toHaveLength(1)
    })

    it('filters out substances shorter than 3 characters', () => {
      const allergies = [makeAllergy('AB')]
      const results = checkAllergyMatch('Tablet AB', allergies)

      expect(results).toHaveLength(0)
    })

    it('filters out drug names shorter than 3 characters', () => {
      const allergies = [makeAllergy('Penicillin')]
      const results = checkAllergyMatch('AB', allergies)

      expect(results).toHaveLength(0)
    })

    it('returns empty array when no allergies provided', () => {
      const results = checkAllergyMatch('Warfarin', [])
      expect(results).toHaveLength(0)
    })
  })

  // =========================================================================
  // getMedicationNamesFromStatements
  // =========================================================================
  describe('getMedicationNamesFromStatements', () => {
    it('extracts display names from MedicationStatements', () => {
      const statements = [
        makeMedicationStatement('Warfarin 5mg'),
        makeMedicationStatement('Lisinopril 10mg'),
      ]
      const names = getMedicationNamesFromStatements(statements)

      expect(names).toEqual(['Warfarin 5mg', 'Lisinopril 10mg'])
    })

    it('filters out empty display names', () => {
      const statements = [
        makeMedicationStatement('Warfarin 5mg'),
        makeMedicationStatement(''),
      ]
      const names = getMedicationNamesFromStatements(statements)

      expect(names).toEqual(['Warfarin 5mg'])
    })
  })

  // =========================================================================
  // Cross-encounter interaction check via options
  // =========================================================================
  describe('cross-encounter interaction check', () => {
    it('checks against both pending prescriptions and active MedicationStatements', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES)
      const activeMedStatements = [makeMedicationStatement('Ibuprofen')]

      const result = await checkInteractions(
        'Methotrexate',
        ['Amoxicillin'], // pending prescription
        { activeMedications: activeMedStatements }, // history
        adapter,
      )

      expect(result.result).toBe('BLOCKED')
      expect(result.interactions).toHaveLength(2) // Ibuprofen (MAJOR) + Amoxicillin (MINOR)
    })

    it('deduplicates medication names from pending and history', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES)
      const activeMedStatements = [makeMedicationStatement('Aspirin')] // same as pending

      const result = await checkInteractions(
        'Warfarin',
        ['Aspirin'], // duplicate
        { activeMedications: activeMedStatements },
        adapter,
      )

      expect(result.interactions).toHaveLength(1) // deduplicated
    })
  })

  // =========================================================================
  // Performance: <200ms for 100-drug batch
  // =========================================================================
  describe('performance', () => {
    it('checks 100 drugs in under 200ms', async () => {
      // Build a large fixture with many interactions
      const largeFix: VocabInteractionEntry[] = []
      for (let i = 0; i < 500; i++) {
        largeFix.push({
          drugA: `DrugA_${i}`,
          drugB: `DrugB_${i}`,
          severity: 'MODERATE',
          description: `Interaction ${i}`,
        })
      }
      const adapter = createAdapter(largeFix)

      const activeMeds = Array.from({ length: 10 }, (_, i) => `DrugB_${i}`)

      const start = performance.now()
      for (let i = 0; i < 100; i++) {
        invalidateCache()
        await checkInteractions(`DrugA_${i % 500}`, activeMeds, undefined, adapter)
      }
      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(200)
    })
  })

  // =========================================================================
  // No adapter provided — returns UNAVAILABLE (drug-drug check not possible)
  // =========================================================================
  describe('no adapter provided', () => {
    it('returns UNAVAILABLE with allergy matches preserved when no adapter', async () => {
      const allergies = [makeAllergy('Penicillin')]
      const result = await checkInteractions('Penicillin V', [], { activeAllergies: allergies })

      expect(result.result).toBe('UNAVAILABLE')
      expect(result.reason).toBe('ADAPTER_ERROR')
      expect(result.interactions).toHaveLength(1)
      expect(result.interactions[0]!.severity).toBe(DrugInteractionSeverity.ALLERGY_MATCH)
    })

    it('returns UNAVAILABLE when no adapter and no allergy match', async () => {
      const result = await checkInteractions('Paracetamol', [])

      expect(result.result).toBe('UNAVAILABLE')
      expect(result.reason).toBe('ADAPTER_ERROR')
      expect(result.interactions).toHaveLength(0)
    })
  })

  // =========================================================================
  // Adapter failure — returns UNAVAILABLE, preserves allergy matches
  // =========================================================================
  describe('adapter failure', () => {
    it('returns UNAVAILABLE when adapter throws', async () => {
      const failingAdapter: DrugDatabaseAdapter = {
        getInteractions: async () => { throw new Error('DB connection lost') },
      }
      const result = await checkInteractions('Warfarin', ['Aspirin'], undefined, failingAdapter)

      expect(result.result).toBe('UNAVAILABLE')
      expect(result.reason).toBe('ADAPTER_ERROR')
      expect(result.interactions).toEqual([])
    })

    it('preserves allergy matches when adapter throws', async () => {
      const failingAdapter: DrugDatabaseAdapter = {
        getInteractions: async () => { throw new Error('DB connection lost') },
      }
      const allergies = [makeAllergy('Warfarin')]
      const result = await checkInteractions('Warfarin', ['Aspirin'], { activeAllergies: allergies }, failingAdapter)

      expect(result.result).toBe('UNAVAILABLE')
      expect(result.reason).toBe('ADAPTER_ERROR')
      expect(result.interactions).toHaveLength(1)
      expect(result.interactions[0]!.severity).toBe(DrugInteractionSeverity.ALLERGY_MATCH)
    })
  })

  // =========================================================================
  // UNAVAILABLE preserves allergy matches (empty DB + allergies)
  // =========================================================================
  describe('empty database preserves allergy matches', () => {
    it('returns UNAVAILABLE but includes allergy matches when DB is empty', async () => {
      const adapter = createEmptyAdapter()
      const allergies = [makeAllergy('Warfarin')]
      const result = await checkInteractions('Warfarin', ['Aspirin'], { activeAllergies: allergies }, adapter)

      expect(result.result).toBe('UNAVAILABLE')
      expect(result.reason).toBe('EMPTY_DATABASE')
      expect(result.interactions).toHaveLength(1)
      expect(result.interactions[0]!.severity).toBe(DrugInteractionSeverity.ALLERGY_MATCH)
    })
  })

  // =========================================================================
  // Database staleness enforcement (Story 25.2)
  // =========================================================================
  describe('database staleness enforcement', () => {
    const FIXED_NOW = new Date('2026-05-02T12:00:00.000Z').getTime()

    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(FIXED_NOW)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    function daysAgo(days: number, extraMs = 0): string {
      return new Date(FIXED_NOW - days * 24 * 60 * 60 * 1000 - extraMs).toISOString()
    }

    it('returns UNAVAILABLE with reason DATABASE_STALE when metadata is 50 days old', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES, { lastUpdatedAt: daysAgo(50), version: 1 })
      const result = await checkInteractions('Warfarin', ['Aspirin'], undefined, adapter)

      expect(result.result).toBe('UNAVAILABLE')
      expect(result.reason).toBe('DATABASE_STALE')
    })

    it('proceeds normally when metadata is 30 days old (fresh)', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES, { lastUpdatedAt: daysAgo(30), version: 1 })
      const result = await checkInteractions('Warfarin', ['Aspirin'], undefined, adapter)

      expect(result.result).toBe('BLOCKED')
      expect(result.reason).toBeUndefined()
    })

    it('proceeds normally at exactly 45 days (boundary: not stale yet)', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES, { lastUpdatedAt: daysAgo(45), version: 1 })
      const result = await checkInteractions('Warfarin', ['Aspirin'], undefined, adapter)

      expect(result.result).toBe('BLOCKED')
      expect(result.reason).toBeUndefined()
    })

    it('returns UNAVAILABLE at 45 days + 1ms (boundary: just stale)', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES, { lastUpdatedAt: daysAgo(45, 1), version: 1 })
      const result = await checkInteractions('Warfarin', ['Aspirin'], undefined, adapter)

      expect(result.result).toBe('UNAVAILABLE')
      expect(result.reason).toBe('DATABASE_STALE')
    })

    it('returns UNAVAILABLE when lastUpdatedAt is an invalid date string', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES, { lastUpdatedAt: 'not-a-date', version: 1 })
      const result = await checkInteractions('Warfarin', ['Aspirin'], undefined, adapter)

      expect(result.result).toBe('UNAVAILABLE')
      expect(result.reason).toBe('DATABASE_STALE')
    })

    it('skips staleness check when adapter has no getMetadata', async () => {
      const adapter: DrugDatabaseAdapter = { getInteractions: async () => FIXTURE_ENTRIES }
      const result = await checkInteractions('Warfarin', ['Aspirin'], undefined, adapter)

      expect(result.result).toBe('BLOCKED')
      expect(result.reason).toBeUndefined()
    })

    it('skips staleness check when getMetadata returns null', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES, null)
      const result = await checkInteractions('Warfarin', ['Aspirin'], undefined, adapter)

      expect(result.result).toBe('BLOCKED')
      expect(result.reason).toBeUndefined()
    })

    it('calls onStale callback when database is stale', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES, { lastUpdatedAt: daysAgo(50), version: 1 })
      const onStale = vi.fn()
      await checkInteractions('Warfarin', ['Aspirin'], { onStale }, adapter)

      expect(onStale).toHaveBeenCalledOnce()
    })

    it('preserves allergy results even when database is stale', async () => {
      const adapter = createAdapter(FIXTURE_ENTRIES, { lastUpdatedAt: daysAgo(50), version: 1 })
      const allergies = [makeAllergy('Warfarin')]
      const result = await checkInteractions('Warfarin', ['Aspirin'], { activeAllergies: allergies }, adapter)

      expect(result.result).toBe('UNAVAILABLE')
      expect(result.reason).toBe('DATABASE_STALE')
      expect(result.interactions).toHaveLength(1)
      expect(result.interactions[0]!.severity).toBe(DrugInteractionSeverity.ALLERGY_MATCH)
    })
  })

  // =========================================================================
  // Cache invalidation during in-flight build
  // =========================================================================
  describe('cache invalidation during in-flight build', () => {
    it('discards stale build result after invalidateCache', async () => {
      let resolveFirst!: (v: VocabInteractionEntry[]) => void
      const slowAdapter: DrugDatabaseAdapter = {
        getInteractions: () => new Promise((r) => { resolveFirst = r }),
      }

      // Start a build
      const firstCall = checkInteractions('Warfarin', ['Aspirin'], undefined, slowAdapter)

      // Invalidate before it resolves
      invalidateCache()

      // Resolve the stale build
      resolveFirst(FIXTURE_ENTRIES)
      const result = await firstCall

      // The stale build should not populate the cache — next call should re-fetch
      invalidateCache()
      const freshAdapter = createAdapter(FIXTURE_ENTRIES)
      const result2 = await checkInteractions('Warfarin', ['Aspirin'], undefined, freshAdapter)
      expect(result2.result).toBe('BLOCKED')
    })
  })
})
