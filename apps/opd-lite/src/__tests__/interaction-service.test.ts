import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import {
  checkInteractions,
  invalidateInteractionCache,
  type InteractionResult,
  type InteractionCheckSummary,
} from '@/services/interactionService'
import { DrugInteractionSeverity } from '@ultranos/shared-types'
import { seedVocabularyIfEmpty } from '@/lib/vocabulary-seeder'
import { db } from '@/lib/db'

beforeAll(async () => {
  await seedVocabularyIfEmpty()
})

describe('InteractionChecker service (Dexie-backed)', () => {
  describe('checkInteractions', () => {
    it('returns CLEAR when no interactions exist', async () => {
      const result = await checkInteractions('Paracetamol', ['Amoxicillin'])
      expect(result.result).toBe('CLEAR')
      expect(result.interactions).toHaveLength(0)
    })

    it('returns CLEAR when active medications list is empty', async () => {
      const result = await checkInteractions('Warfarin', [])
      expect(result.result).toBe('CLEAR')
      expect(result.interactions).toHaveLength(0)
    })

    it('returns BLOCKED for CONTRAINDICATED interactions', async () => {
      const result = await checkInteractions('Warfarin', ['Aspirin'])
      expect(result.result).toBe('BLOCKED')
      expect(result.interactions.length).toBeGreaterThanOrEqual(1)
      expect(result.interactions[0].severity).toBe(DrugInteractionSeverity.CONTRAINDICATED)
      expect(result.interactions[0].description).toBeTruthy()
    })

    it('returns BLOCKED for MAJOR interactions', async () => {
      const result = await checkInteractions('Warfarin', ['Ibuprofen'])
      expect(result.result).toBe('BLOCKED')
      expect(result.interactions.length).toBeGreaterThanOrEqual(1)
      expect(result.interactions[0].severity).toBe(DrugInteractionSeverity.MAJOR)
    })

    it('returns WARNING for MODERATE interactions', async () => {
      const result = await checkInteractions('Omeprazole', ['Clopidogrel'])
      expect(result.result).toBe('WARNING')
      expect(result.interactions.length).toBeGreaterThanOrEqual(1)
      expect(result.interactions[0].severity).toBe(DrugInteractionSeverity.MODERATE)
    })

    it('is bidirectional - order of drugs does not matter', async () => {
      const resultA = await checkInteractions('Warfarin', ['Aspirin'])
      const resultB = await checkInteractions('Aspirin', ['Warfarin'])
      expect(resultA.result).toBe(resultB.result)
      expect(resultA.interactions.length).toBe(resultB.interactions.length)
    })

    it('is case-insensitive for drug names', async () => {
      const result = await checkInteractions('warfarin', ['ASPIRIN'])
      expect(result.result).toBe('BLOCKED')
    })

    it('detects multiple interactions at once', async () => {
      const result = await checkInteractions('Warfarin', ['Aspirin', 'Ibuprofen', 'Paracetamol'])
      expect(result.result).toBe('BLOCKED')
      expect(result.interactions.length).toBeGreaterThanOrEqual(2)
    })

    it('returns the highest severity when multiple interactions exist', async () => {
      const result = await checkInteractions('Warfarin', ['Aspirin', 'Clopidogrel'])
      expect(result.result).toBe('BLOCKED')
      const hasSevere = result.interactions.some(
        (i) => i.severity === DrugInteractionSeverity.CONTRAINDICATED
      )
      expect(hasSevere).toBe(true)
    })

    it('interaction results include drugA, drugB, severity, and description', async () => {
      const result = await checkInteractions('Warfarin', ['Aspirin'])
      expect(result.interactions.length).toBeGreaterThan(0)
      const interaction = result.interactions[0]
      expect(interaction).toHaveProperty('drugA')
      expect(interaction).toHaveProperty('drugB')
      expect(interaction).toHaveProperty('severity')
      expect(interaction).toHaveProperty('description')
      expect(interaction.drugA).toBeTruthy()
      expect(interaction.drugB).toBeTruthy()
      expect(interaction.description.length).toBeGreaterThan(0)
    })

    it('detects dual RAAS blockade (ACE inhibitor + ARB)', async () => {
      const result = await checkInteractions('Lisinopril', ['Losartan'])
      expect(result.result).toBe('BLOCKED')
      expect(result.interactions[0].severity).toBe(DrugInteractionSeverity.CONTRAINDICATED)
    })

    it('detects serotonin syndrome risk (SSRI + TCA)', async () => {
      const result = await checkInteractions('Fluoxetine', ['Amitriptyline'])
      expect(result.result).toBe('BLOCKED')
    })

    it('detects CNS depression risk (opioid + benzodiazepine)', async () => {
      const result = await checkInteractions('Morphine', ['Diazepam'])
      expect(result.result).toBe('BLOCKED')
    })

    it('detects digoxin + spironolactone interaction', async () => {
      const result = await checkInteractions('Digoxin', ['Spironolactone'])
      expect(result.result).toBe('BLOCKED')
    })

    it('detects levothyroxine absorption interactions (MODERATE)', async () => {
      const result = await checkInteractions('Levothyroxine', ['Calcium Carbonate'])
      expect(result.result).toBe('WARNING')
    })

    it('executes in under 200ms', async () => {
      // Warm up the cache
      await checkInteractions('Warfarin', ['Aspirin'])

      const start = performance.now()
      for (let i = 0; i < 100; i++) {
        await checkInteractions('Warfarin', [
          'Aspirin', 'Ibuprofen', 'Metformin', 'Amlodipine', 'Lisinopril',
          'Omeprazole', 'Paracetamol', 'Atorvastatin', 'Clopidogrel', 'Prednisolone',
        ])
      }
      const elapsed = (performance.now() - start) / 100
      expect(elapsed).toBeLessThan(200)
    })

    it('returns unknown drug as CLEAR (no false negatives from missing data)', async () => {
      const result = await checkInteractions('UnknownDrugXYZ', ['Warfarin'])
      expect(result.result).toBe('CLEAR')
      expect(result.interactions).toHaveLength(0)
    })

    it('handles MINOR interactions as WARNING', async () => {
      const result = await checkInteractions('Cetirizine', ['Loratadine'])
      expect(result.result).toBe('WARNING')
      expect(result.interactions[0].severity).toBe(DrugInteractionSeverity.MINOR)
    })

    it('detects NSAIDs + ACE inhibitor interaction', async () => {
      const result = await checkInteractions('Ibuprofen', ['Lisinopril'])
      expect(result.result).toBe('BLOCKED')
    })

    it('detects beta-blocker + insulin masking hypoglycemia', async () => {
      const result = await checkInteractions('Atenolol', ['Insulin Glargine'])
      expect(result.result).toBe('WARNING')
    })
  })

  describe('safety invariants', () => {
    beforeEach(() => {
      invalidateInteractionCache()
      vi.restoreAllMocks()
    })

    it('throws when interaction database is empty (P1 — empty-DB false negative)', async () => {
      vi.spyOn(db.vocabularyInteractions, 'toArray').mockResolvedValueOnce([])
      await expect(checkInteractions('Warfarin', ['Aspirin'])).rejects.toThrow(
        'Interaction database empty',
      )
    })

    it('concurrent calls result in only one buildLookupMap (P2 — build race fix)', async () => {
      const toArraySpy = vi.spyOn(db.vocabularyInteractions, 'toArray')

      // Fire three concurrent calls before any resolves
      const [r1, r2, r3] = await Promise.all([
        checkInteractions('Warfarin', ['Aspirin']),
        checkInteractions('Warfarin', ['Ibuprofen']),
        checkInteractions('Warfarin', ['Aspirin']),
      ])

      // toArray should have been called exactly once across all three concurrent callers
      expect(toArraySpy).toHaveBeenCalledTimes(1)
      // Results should still be correct
      expect(r1.result).toBe('BLOCKED')
      expect(r2.result).toBe('BLOCKED')
      expect(r3.result).toBe('BLOCKED')
    })

    it('throws when severity string is unknown (P3 — unknown severity false negative)', async () => {
      vi.spyOn(db.vocabularyInteractions, 'toArray').mockResolvedValueOnce([
        {
          id: 'test-entry-1',
          drugA: 'DrugA',
          drugB: 'DrugB',
          severity: 'UNKNOWN_SEVERITY',
          description: 'Test interaction',
        } as any,
      ])
      await expect(checkInteractions('DrugA', ['DrugB'])).rejects.toThrow(
        'Unknown drug interaction severity: "UNKNOWN_SEVERITY"',
      )
    })
  })
})
