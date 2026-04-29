import { describe, it, expect } from 'vitest'
import {
  checkInteractions,
  type InteractionResult,
  type InteractionCheckSummary,
} from '@/services/interactionService'
import { DrugInteractionSeverity } from '@ultranos/shared-types'

describe('InteractionChecker service', () => {
  describe('checkInteractions', () => {
    it('returns CLEAR when no interactions exist', () => {
      const result = checkInteractions('Paracetamol', ['Amoxicillin'])
      expect(result.result).toBe('CLEAR')
      expect(result.interactions).toHaveLength(0)
    })

    it('returns CLEAR when active medications list is empty', () => {
      const result = checkInteractions('Warfarin', [])
      expect(result.result).toBe('CLEAR')
      expect(result.interactions).toHaveLength(0)
    })

    it('returns BLOCKED for CONTRAINDICATED interactions', () => {
      // Warfarin + Aspirin = CONTRAINDICATED
      const result = checkInteractions('Warfarin', ['Aspirin'])
      expect(result.result).toBe('BLOCKED')
      expect(result.interactions.length).toBeGreaterThanOrEqual(1)
      expect(result.interactions[0].severity).toBe(DrugInteractionSeverity.CONTRAINDICATED)
      expect(result.interactions[0].description).toBeTruthy()
    })

    it('returns BLOCKED for MAJOR interactions', () => {
      // Warfarin + Ibuprofen = MAJOR
      const result = checkInteractions('Warfarin', ['Ibuprofen'])
      expect(result.result).toBe('BLOCKED')
      expect(result.interactions.length).toBeGreaterThanOrEqual(1)
      expect(result.interactions[0].severity).toBe(DrugInteractionSeverity.MAJOR)
    })

    it('returns WARNING for MODERATE interactions', () => {
      // Omeprazole + Clopidogrel = MODERATE
      const result = checkInteractions('Omeprazole', ['Clopidogrel'])
      expect(result.result).toBe('WARNING')
      expect(result.interactions.length).toBeGreaterThanOrEqual(1)
      expect(result.interactions[0].severity).toBe(DrugInteractionSeverity.MODERATE)
    })

    it('is bidirectional - order of drugs does not matter', () => {
      const resultA = checkInteractions('Warfarin', ['Aspirin'])
      const resultB = checkInteractions('Aspirin', ['Warfarin'])
      expect(resultA.result).toBe(resultB.result)
      expect(resultA.interactions.length).toBe(resultB.interactions.length)
    })

    it('is case-insensitive for drug names', () => {
      const result = checkInteractions('warfarin', ['ASPIRIN'])
      expect(result.result).toBe('BLOCKED')
    })

    it('detects multiple interactions at once', () => {
      // Warfarin interacts with both Aspirin and Ibuprofen
      const result = checkInteractions('Warfarin', ['Aspirin', 'Ibuprofen', 'Paracetamol'])
      expect(result.result).toBe('BLOCKED')
      expect(result.interactions.length).toBeGreaterThanOrEqual(2)
    })

    it('returns the highest severity when multiple interactions exist', () => {
      // If both CONTRAINDICATED and MODERATE found, result should be BLOCKED
      const result = checkInteractions('Warfarin', ['Aspirin', 'Clopidogrel'])
      expect(result.result).toBe('BLOCKED')
      // Should contain the CONTRAINDICATED interaction
      const hasSevere = result.interactions.some(
        (i) => i.severity === DrugInteractionSeverity.CONTRAINDICATED
      )
      expect(hasSevere).toBe(true)
    })

    it('interaction results include drugA, drugB, severity, and description', () => {
      const result = checkInteractions('Warfarin', ['Aspirin'])
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

    it('detects dual RAAS blockade (ACE inhibitor + ARB)', () => {
      // Lisinopril (ACE) + Losartan (ARB) = CONTRAINDICATED
      const result = checkInteractions('Lisinopril', ['Losartan'])
      expect(result.result).toBe('BLOCKED')
      expect(result.interactions[0].severity).toBe(DrugInteractionSeverity.CONTRAINDICATED)
    })

    it('detects serotonin syndrome risk (SSRI + TCA)', () => {
      // Fluoxetine + Amitriptyline = CONTRAINDICATED
      const result = checkInteractions('Fluoxetine', ['Amitriptyline'])
      expect(result.result).toBe('BLOCKED')
    })

    it('detects CNS depression risk (opioid + benzodiazepine)', () => {
      // Morphine + Diazepam = MAJOR
      const result = checkInteractions('Morphine', ['Diazepam'])
      expect(result.result).toBe('BLOCKED')
    })

    it('detects digoxin + spironolactone interaction', () => {
      const result = checkInteractions('Digoxin', ['Spironolactone'])
      expect(result.result).toBe('BLOCKED')
    })

    it('detects levothyroxine absorption interactions (MODERATE)', () => {
      // Levothyroxine + Calcium Carbonate = MODERATE
      const result = checkInteractions('Levothyroxine', ['Calcium Carbonate'])
      expect(result.result).toBe('WARNING')
    })

    it('executes in under 200ms', () => {
      const start = performance.now()
      // Run multiple checks to ensure consistent performance
      for (let i = 0; i < 100; i++) {
        checkInteractions('Warfarin', [
          'Aspirin', 'Ibuprofen', 'Metformin', 'Amlodipine', 'Lisinopril',
          'Omeprazole', 'Paracetamol', 'Atorvastatin', 'Clopidogrel', 'Prednisolone',
        ])
      }
      const elapsed = (performance.now() - start) / 100
      expect(elapsed).toBeLessThan(200)
    })

    it('returns unknown drug as CLEAR (no false negatives from missing data)', () => {
      // A drug not in the matrix should return CLEAR, not error
      const result = checkInteractions('UnknownDrugXYZ', ['Warfarin'])
      expect(result.result).toBe('CLEAR')
      expect(result.interactions).toHaveLength(0)
    })

    it('handles MINOR interactions as WARNING', () => {
      // Cetirizine + Loratadine = MINOR (duplicate antihistamines)
      const result = checkInteractions('Cetirizine', ['Loratadine'])
      expect(result.result).toBe('WARNING')
      expect(result.interactions[0].severity).toBe(DrugInteractionSeverity.MINOR)
    })

    it('detects NSAIDs + ACE inhibitor interaction', () => {
      // Ibuprofen + Lisinopril = MAJOR
      const result = checkInteractions('Ibuprofen', ['Lisinopril'])
      expect(result.result).toBe('BLOCKED')
    })

    it('detects beta-blocker + insulin masking hypoglycemia', () => {
      // Atenolol + Insulin Glargine = MODERATE
      const result = checkInteractions('Atenolol', ['Insulin Glargine'])
      expect(result.result).toBe('WARNING')
    })
  })
})
