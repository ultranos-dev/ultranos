import type { FhirCondition } from '@ultranos/shared-types'
import type { Icd10Item } from '@/lib/vocab-search'
import { hlc, serializeHlc } from '@/lib/hlc'

export type DiagnosisRank = 'primary' | 'secondary'

interface MapConditionInput {
  item: Icd10Item
  encounterId: string
  patientId: string
  rank: DiagnosisRank
}

export function mapIcd10ToCondition(input: MapConditionInput): FhirCondition {
  if (!input.encounterId?.trim()) {
    throw new Error('encounterId is required')
  }
  if (!input.patientId?.trim()) {
    throw new Error('patientId is required')
  }

  const nowIso = new Date().toISOString()
  const ts = hlc.now()

  return {
    id: crypto.randomUUID(),
    resourceType: 'Condition',
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          code: 'active',
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system:
              'http://terminology.hl7.org/CodeSystem/condition-category',
            code: 'encounter-diagnosis',
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: 'http://hl7.org/fhir/sid/icd-10',
          code: input.item.code,
          display: input.item.display,
        },
      ],
      text: input.item.display,
    },
    subject: {
      reference: `Patient/${input.patientId}`,
    },
    encounter: {
      reference: `Encounter/${input.encounterId}`,
    },
    recordedDate: nowIso,
    _ultranos: {
      isOfflineCreated: true,
      hlcTimestamp: serializeHlc(ts),
      createdAt: nowIso,
      diagnosisRank: input.rank,
    },
    meta: {
      lastUpdated: nowIso,
      versionId: '1',
    },
  }
}
