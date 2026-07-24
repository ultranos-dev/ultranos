import { describe, it, expect } from 'vitest'
import { flattenForDb } from '../lib/resource-mappers'

describe('flattenForDb', () => {
  describe('Encounter', () => {
    const fhirEncounter = {
      id: '68d6aa02-1234-5678-9abc-def012345678',
      resourceType: 'Encounter',
      status: 'in-progress',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
        display: 'ambulatory',
      },
      subject: {
        reference: 'Patient/aabbccdd-1111-2222-3333-444455556666',
      },
      participant: [
        { individual: { reference: 'Practitioner/p-001' } },
      ],
      period: {
        start: '2026-05-30T08:00:00.000Z',
      },
      _ultranos: {
        isOfflineCreated: true,
        hlcTimestamp: '000001748600000000:00000:node-1',
        createdAt: '2026-05-30T08:00:00.000Z',
        clinicId: 'clinic-42',
      },
      meta: {
        lastUpdated: '2026-05-30T08:00:00.000Z',
        versionId: '1',
      },
    }

    it('flattens nested class object into classSystem/classCode/classDisplay', () => {
      const result = flattenForDb('Encounter', fhirEncounter)
      expect(result.classSystem).toBe('http://terminology.hl7.org/CodeSystem/v3-ActCode')
      expect(result.classCode).toBe('AMB')
      expect(result.classDisplay).toBe('ambulatory')
      expect(result).not.toHaveProperty('class')
    })

    it('extracts subject UUID from Patient/ reference', () => {
      const result = flattenForDb('Encounter', fhirEncounter)
      expect(result.subjectId).toBe('aabbccdd-1111-2222-3333-444455556666')
      expect(result).not.toHaveProperty('subject')
    })

    it('flattens period into periodStart/periodEnd', () => {
      const result = flattenForDb('Encounter', fhirEncounter)
      expect(result.periodStart).toBe('2026-05-30T08:00:00.000Z')
      expect(result.periodEnd).toBeNull()
      expect(result).not.toHaveProperty('period')
    })

    it('flattens _ultranos fields to top-level columns', () => {
      const result = flattenForDb('Encounter', fhirEncounter)
      expect(result.isOfflineCreated).toBe(true)
      expect(result.clinicId).toBe('clinic-42')
      expect(result.createdAt).toBe('2026-05-30T08:00:00.000Z')
      expect(result).not.toHaveProperty('_ultranos')
    })

    it('flattens meta into versionId/lastUpdated', () => {
      const result = flattenForDb('Encounter', fhirEncounter)
      expect(result.versionId).toBe('1')
      expect(result.lastUpdated).toBe('2026-05-30T08:00:00.000Z')
      expect(result).not.toHaveProperty('meta')
    })

    it('maps FHIR diagnosis to diagnosisRefs, never a `diagnosis` key (which the field encryptor would catch)', () => {
      const withDx = {
        ...fhirEncounter,
        diagnosis: [{ condition: { reference: 'Condition/c-1' }, rank: 1 }],
      }
      const result = flattenForDb('Encounter', withDx)
      expect(result.diagnosisRefs).toEqual([{ condition: { reference: 'Condition/c-1' }, rank: 1 }])
      // A `diagnosis` key would be JSON-encrypted-as-text by encryptRow and corrupt the jsonb write.
      expect(result).not.toHaveProperty('diagnosis')
    })

    it('strips resourceType (not a DB column)', () => {
      const result = flattenForDb('Encounter', fhirEncounter)
      expect(result).not.toHaveProperty('resourceType')
    })

    it('preserves JSONB fields as-is', () => {
      const result = flattenForDb('Encounter', fhirEncounter)
      expect(result.participant).toEqual([
        { individual: { reference: 'Practitioner/p-001' } },
      ])
    })

    it('normalizes a bare-UUID participant reference to Practitioner/<id>', () => {
      // A spoke that stored the participant as a bare id (no resource-type prefix)
      // must be normalized so participant-scoped queries (listByPractitioner) match.
      const bare = {
        ...fhirEncounter,
        participant: [
          { individual: { reference: '8586f2d7-c46d-4d0f-b31f-9cb9f5aaecdc' } },
        ],
      }
      const result = flattenForDb('Encounter', bare)
      expect(result.participant).toEqual([
        { individual: { reference: 'Practitioner/8586f2d7-c46d-4d0f-b31f-9cb9f5aaecdc' } },
      ])
    })

    it('leaves an already-prefixed participant reference untouched', () => {
      const result = flattenForDb('Encounter', fhirEncounter)
      expect(result.participant).toEqual([
        { individual: { reference: 'Practitioner/p-001' } },
      ])
    })

    it('leaves a non-Practitioner participant reference untouched', () => {
      const withPatientActor = {
        ...fhirEncounter,
        participant: [
          { individual: { reference: 'RelatedPerson/rp-1' } },
        ],
      }
      const result = flattenForDb('Encounter', withPatientActor)
      expect(result.participant).toEqual([
        { individual: { reference: 'RelatedPerson/rp-1' } },
      ])
    })

    it('preserves the encounter id', () => {
      const result = flattenForDb('Encounter', fhirEncounter)
      expect(result.id).toBe('68d6aa02-1234-5678-9abc-def012345678')
    })

    it('handles finished encounter with period.end', () => {
      const finished = {
        ...fhirEncounter,
        status: 'finished',
        period: {
          start: '2026-05-30T08:00:00.000Z',
          end: '2026-05-30T08:30:00.000Z',
        },
      }
      const result = flattenForDb('Encounter', finished)
      expect(result.periodStart).toBe('2026-05-30T08:00:00.000Z')
      expect(result.periodEnd).toBe('2026-05-30T08:30:00.000Z')
    })

    it('handles optional fields being absent', () => {
      const minimal = {
        id: '68d6aa02-1234-5678-9abc-def012345678',
        resourceType: 'Encounter',
        status: 'planned',
        subject: { reference: 'Patient/abc' },
        period: {},
        _ultranos: {
          isOfflineCreated: false,
          hlcTimestamp: '000001748600000000:00000:node-1',
          createdAt: '2026-05-30T08:00:00.000Z',
        },
        meta: { lastUpdated: '2026-05-30T08:00:00.000Z', versionId: '1' },
      }
      const result = flattenForDb('Encounter', minimal)
      expect(result.classCode).toBe('AMB') // default
      expect(result.participant).toBeNull()
      expect(result.type).toBeNull()
      expect(result.reasonCode).toBeNull()
      expect(result.diagnosisRefs).toBeNull()
      expect(result.soapNoteId).toBeNull()
    })
  })

  describe('ClinicalImpression', () => {
    it('flattens meta into versionId/lastUpdated', () => {
      const soap = {
        id: 'soap-001',
        resourceType: 'ClinicalImpression',
        encounterId: 'enc-001',
        practitionerId: 'prac-001',
        soapSubjective: 'Patient reports headache',
        meta: { versionId: '2', lastUpdated: '2026-05-30T09:00:00.000Z' },
        _ultranos: { createdAt: '2026-05-30T08:00:00.000Z' },
      }
      const result = flattenForDb('ClinicalImpression', soap)
      expect(result.versionId).toBe('2')
      expect(result.lastUpdated).toBe('2026-05-30T09:00:00.000Z')
      expect(result).not.toHaveProperty('meta')
      expect(result).not.toHaveProperty('resourceType')
    })
  })

  describe('Patient', () => {
    it('strips resourceType and passes through', () => {
      const patient = {
        id: 'p-001',
        resourceType: 'Patient',
        nameLocal: 'محمد',
        gender: 'male',
      }
      const result = flattenForDb('Patient', patient)
      expect(result).not.toHaveProperty('resourceType')
      expect(result.nameLocal).toBe('محمد')
      expect(result.gender).toBe('male')
    })
  })

  describe('unmapped resource type', () => {
    it('strips resourceType and passes through for unknown types', () => {
      const unknown = {
        id: 'x-001',
        resourceType: 'ServiceRequest',
        someField: 'value',
      }
      const result = flattenForDb('ServiceRequest', unknown)
      expect(result).not.toHaveProperty('resourceType')
      expect(result.someField).toBe('value')
    })
  })
})
