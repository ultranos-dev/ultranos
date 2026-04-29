import type { ClinicalImpressionNote } from '@ultranos/shared-types'
import { hlc, serializeHlc } from '@/lib/hlc'

interface MapSoapInput {
  subjective: string
  objective: string
  encounterId: string
  patientId: string
  practitionerId: string
}

export function mapSoapToClinicalImpression(input: MapSoapInput): ClinicalImpressionNote {
  const nowIso = new Date().toISOString()
  const ts = hlc.now()

  return {
    id: crypto.randomUUID(),
    resourceType: 'ClinicalImpression',
    status: 'in-progress',
    subject: {
      reference: `Patient/${input.patientId}`,
    },
    encounter: {
      reference: `Encounter/${input.encounterId}`,
    },
    assessor: {
      reference: `Practitioner/${input.practitionerId}`,
    },
    date: nowIso,
    note: [
      {
        text: `[Subjective] ${input.subjective}`,
        time: nowIso,
      },
      {
        text: `[Objective] ${input.objective}`,
        time: nowIso,
      },
    ],
    _ultranos: {
      isOfflineCreated: true,
      hlcTimestamp: serializeHlc(ts),
      createdAt: nowIso,
    },
    meta: {
      lastUpdated: nowIso,
      versionId: '1',
    },
  }
}
