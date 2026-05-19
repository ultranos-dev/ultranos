import {
  getActiveAllergies,
  getAllergyById,
  getAllAllergiesForExport,
  getSubstanceName,
} from '@/data/allergy-queries'
import type { FhirAllergyIntolerance } from '@ultranos/shared-types'

// --- Mock DB ---

function makeMockDb(rows: Array<{ id: string; data: string }> = []) {
  return {
    getAllAsync: jest.fn().mockResolvedValue(
      rows.map((r) => ({
        id: r.id,
        patient_id: 'patient-001',
        resource_type: 'AllergyIntolerance',
        data: r.data,
        updated_at: '2026-05-01T00:00:00Z',
      })),
    ),
    getFirstAsync: jest.fn().mockImplementation((_sql: string, params: string[]) => {
      const match = rows.find((r) => r.id === params[0])
      if (!match) return Promise.resolve(null)
      return Promise.resolve({
        id: match.id,
        patient_id: 'patient-001',
        resource_type: 'AllergyIntolerance',
        data: match.data,
        updated_at: '2026-05-01T00:00:00Z',
      })
    }),
  } as any
}

function makeAllergyJson(overrides: Partial<FhirAllergyIntolerance> = {}): string {
  const base: FhirAllergyIntolerance = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    resourceType: 'AllergyIntolerance',
    clinicalStatus: {
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
        code: 'active',
      }],
    },
    verificationStatus: {
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
        code: 'confirmed',
      }],
    },
    type: 'allergy',
    criticality: 'high',
    code: {
      coding: [{ system: 'http://snomed.info/sct', code: '91936005', display: 'Penicillin' }],
    },
    patient: { reference: 'Patient/patient-001' },
    recordedDate: '2026-01-15T10:00:00.000Z',
    recorder: { reference: 'Practitioner/dr-001', display: 'Dr. Ahmed' },
    _ultranos: {
      createdAt: '2026-01-15T10:00:00.000Z',
      recordedByRole: 'physician',
      isOfflineCreated: false,
      hlcTimestamp: '2026-01-15T10:00:00.000Z:0:node1',
    },
    meta: { lastUpdated: '2026-01-15T10:00:00.000Z' },
    ...overrides,
  }
  return JSON.stringify(base)
}

// --- Tests ---

describe('allergy-queries', () => {
  describe('getActiveAllergies', () => {
    it('returns only active allergies from the database', async () => {
      const activeJson = makeAllergyJson({ id: '550e8400-e29b-41d4-a716-446655440001' })
      const resolvedJson = makeAllergyJson({
        id: '550e8400-e29b-41d4-a716-446655440002',
        clinicalStatus: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
            code: 'resolved',
          }],
        },
      })

      const db = makeMockDb([
        { id: '550e8400-e29b-41d4-a716-446655440001', data: activeJson },
        { id: '550e8400-e29b-41d4-a716-446655440002', data: resolvedJson },
      ])

      const result = await getActiveAllergies(db)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('550e8400-e29b-41d4-a716-446655440001')
    })

    it('sorts critical allergies before non-critical', async () => {
      const critical = makeAllergyJson({
        id: '550e8400-e29b-41d4-a716-446655440001',
        criticality: 'high',
        code: { coding: [{ system: 'http://snomed.info/sct', code: '91936005', display: 'Penicillin' }] },
      })
      const low = makeAllergyJson({
        id: '550e8400-e29b-41d4-a716-446655440002',
        criticality: 'low',
        code: { coding: [{ system: 'http://snomed.info/sct', code: '111088007', display: 'Aspirin' }] },
      })

      const db = makeMockDb([
        { id: '550e8400-e29b-41d4-a716-446655440002', data: low },
        { id: '550e8400-e29b-41d4-a716-446655440001', data: critical },
      ])

      const result = await getActiveAllergies(db)
      expect(result[0].criticality).toBe('high')
      expect(result[1].criticality).toBe('low')
    })

    it('sorts alphabetically within same criticality', async () => {
      const latex = makeAllergyJson({
        id: '550e8400-e29b-41d4-a716-446655440001',
        criticality: 'low',
        code: { coding: [{ system: 'http://snomed.info/sct', code: '1', display: 'Latex' }] },
      })
      const aspirin = makeAllergyJson({
        id: '550e8400-e29b-41d4-a716-446655440002',
        criticality: 'low',
        code: { coding: [{ system: 'http://snomed.info/sct', code: '2', display: 'Aspirin' }] },
      })

      const db = makeMockDb([
        { id: '550e8400-e29b-41d4-a716-446655440001', data: latex },
        { id: '550e8400-e29b-41d4-a716-446655440002', data: aspirin },
      ])

      const result = await getActiveAllergies(db)
      expect(getSubstanceName(result[0])).toBe('Aspirin')
      expect(getSubstanceName(result[1])).toBe('Latex')
    })

    it('skips corrupted rows gracefully', async () => {
      const valid = makeAllergyJson({ id: '550e8400-e29b-41d4-a716-446655440001' })

      const db = makeMockDb([
        { id: '550e8400-e29b-41d4-a716-446655440001', data: valid },
        { id: 'bad-row', data: '{invalid json' },
        { id: 'schema-mismatch', data: '{"resourceType":"Patient"}' },
      ])

      const result = await getActiveAllergies(db)
      expect(result).toHaveLength(1)
    })

    it('returns empty array when no allergy records exist', async () => {
      const db = makeMockDb([])
      const result = await getActiveAllergies(db)
      expect(result).toEqual([])
    })

    it('queries the correct table and resource_type', async () => {
      const db = makeMockDb([])
      await getActiveAllergies(db)

      expect(db.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('medical_history'),
      )
      expect(db.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("resource_type = 'AllergyIntolerance'"),
      )
    })
  })

  describe('getAllergyById', () => {
    it('returns the allergy matching the given ID', async () => {
      const json = makeAllergyJson({ id: '550e8400-e29b-41d4-a716-446655440001' })
      const db = makeMockDb([{ id: '550e8400-e29b-41d4-a716-446655440001', data: json }])

      const result = await getAllergyById(db, '550e8400-e29b-41d4-a716-446655440001')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('550e8400-e29b-41d4-a716-446655440001')
    })

    it('returns null when ID not found', async () => {
      const db = makeMockDb([])
      const result = await getAllergyById(db, 'non-existent')
      expect(result).toBeNull()
    })
  })

  describe('getAllAllergiesForExport', () => {
    it('returns both active and resolved allergies', async () => {
      const active = makeAllergyJson({ id: '550e8400-e29b-41d4-a716-446655440001' })
      const resolved = makeAllergyJson({
        id: '550e8400-e29b-41d4-a716-446655440002',
        clinicalStatus: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
            code: 'resolved',
          }],
        },
      })

      const db = makeMockDb([
        { id: '550e8400-e29b-41d4-a716-446655440001', data: active },
        { id: '550e8400-e29b-41d4-a716-446655440002', data: resolved },
      ])

      const result = await getAllAllergiesForExport(db)
      expect(result).toHaveLength(2)
    })
  })

  describe('getSubstanceName', () => {
    it('returns coding display when available', () => {
      const allergy = JSON.parse(makeAllergyJson()) as FhirAllergyIntolerance
      expect(getSubstanceName(allergy)).toBe('Penicillin')
    })

    it('falls back to substanceFreeText', () => {
      const allergy = JSON.parse(makeAllergyJson({
        code: { coding: [{ system: 'http://snomed.info/sct', code: '91936005' }] },
        _ultranos: {
          substanceFreeText: 'Peanuts',
          createdAt: '2026-01-15T10:00:00.000Z',
          recordedByRole: 'physician',
          isOfflineCreated: false,
          hlcTimestamp: '2026-01-15T10:00:00.000Z:0:node1',
        },
      })) as FhirAllergyIntolerance
      expect(getSubstanceName(allergy)).toBe('Peanuts')
    })

    it('falls back to code when no display or freeText', () => {
      const allergy = JSON.parse(makeAllergyJson({
        code: { coding: [{ system: 'http://snomed.info/sct', code: '91936005' }] },
      })) as FhirAllergyIntolerance
      // No _ultranos.substanceFreeText in this override, falls to code
      expect(getSubstanceName(allergy)).toBe('91936005')
    })
  })
})
