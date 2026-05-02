import { describe, it, expect } from 'vitest'
import { DrugInteractionSeverity } from '@ultranos/shared-types'
import type { FhirAllergyIntolerance } from '@ultranos/shared-types'
import { checkAllergyMatch } from '@/services/interactionService'

function makeAllergy(substance: string): FhirAllergyIntolerance {
  return {
    id: crypto.randomUUID(),
    resourceType: 'AllergyIntolerance',
    clinicalStatus: {
      coding: [
        {
          system:
            'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical' as const,
          code: 'active',
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system:
            'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification' as const,
          code: 'confirmed',
        },
      ],
    },
    type: 'allergy',
    criticality: 'high',
    code: { text: substance },
    patient: { reference: 'Patient/patient-001' },
    recordedDate: '2026-05-01T10:00:00Z',
    _ultranos: {
      substanceFreeText: substance,
      createdAt: '2026-05-01T10:00:00Z',
      recordedByRole: 'DOCTOR',
      isOfflineCreated: false,
      hlcTimestamp: '000001714600000:00001:node-1',
    },
    meta: { lastUpdated: '2026-05-01T10:00:00Z' },
  }
}

describe('checkAllergyMatch', () => {
  it('returns ALLERGY_MATCH when medication matches allergy substance exactly', () => {
    const allergies = [makeAllergy('Penicillin')]
    const results = checkAllergyMatch('Penicillin', allergies)

    expect(results).toHaveLength(1)
    expect(results[0].severity).toBe(DrugInteractionSeverity.ALLERGY_MATCH)
    expect(results[0].drugA).toBe('Penicillin')
    expect(results[0].drugB).toBe('Penicillin')
  })

  it('matches case-insensitively', () => {
    const allergies = [makeAllergy('penicillin')]
    const results = checkAllergyMatch('PENICILLIN', allergies)

    expect(results).toHaveLength(1)
    expect(results[0].severity).toBe(DrugInteractionSeverity.ALLERGY_MATCH)
  })

  it('matches when drug name contains allergy substance (substring)', () => {
    const allergies = [makeAllergy('Penicillin')]
    const results = checkAllergyMatch('Amoxicillin (Penicillin-class)', allergies)

    expect(results).toHaveLength(1)
    expect(results[0].severity).toBe(DrugInteractionSeverity.ALLERGY_MATCH)
  })

  it('matches when allergy substance contains drug name (reverse substring)', () => {
    const allergies = [makeAllergy('Sulfonamide antibiotics')]
    const results = checkAllergyMatch('Sulfonamide', allergies)

    expect(results).toHaveLength(1)
    expect(results[0].severity).toBe(DrugInteractionSeverity.ALLERGY_MATCH)
  })

  it('returns empty array when no allergies match', () => {
    const allergies = [makeAllergy('Penicillin')]
    const results = checkAllergyMatch('Ibuprofen', allergies)

    expect(results).toHaveLength(0)
  })

  it('returns empty array when no allergies exist', () => {
    const results = checkAllergyMatch('Penicillin', [])
    expect(results).toHaveLength(0)
  })

  it('handles multiple allergies with partial matches', () => {
    const allergies = [
      makeAllergy('Penicillin'),
      makeAllergy('Latex'),
      makeAllergy('Aspirin'),
    ]
    const results = checkAllergyMatch('Aspirin 500mg', allergies)

    expect(results).toHaveLength(1)
    expect(results[0].drugB).toBe('Aspirin')
  })

  it('description includes the allergy substance name', () => {
    const allergies = [makeAllergy('Penicillin')]
    const results = checkAllergyMatch('Penicillin V', allergies)

    expect(results[0].description).toContain('Penicillin')
    expect(results[0].description).toContain('allergy')
  })
})
