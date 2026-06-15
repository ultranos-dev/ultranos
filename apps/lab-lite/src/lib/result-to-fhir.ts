/**
 * FHIR Resource Mapping — Story 42.4 (AC: 10, 11)
 *
 * Converts a completed lab result + observations into a FHIR R4 bundle:
 *   - One DiagnosticReport (panel-level) with status 'preliminary' (or 'registered' for draft)
 *   - One Observation per field with FHIR interpretation codes for abnormal flags
 *
 * PHI note: subject.reference is Patient/<uuid> from the specimen — never a name.
 * All timestamps use ISO 8601 instants.
 */

import type { LabResult, LabObservation } from '@/lib/db'
import type { ResultTemplate, TemplateField } from '@/lib/result-templates'
import type { FhirSpecimen } from '@ultranos/shared-types'

// ---------------------------------------------------------------------------
// Local FHIR types (extended subset for structured result entry)
// The existing observation.schema.ts is a vital-signs subset; we extend it
// locally with interpretation + referenceRange needed for lab observations.
// ---------------------------------------------------------------------------

export interface LabFhirObservation {
  id: string
  resourceType: 'Observation'
  status: 'preliminary' | 'registered'
  code: {
    coding?: Array<{ system?: string; code: string; display?: string }>
    text?: string
  }
  subject?: { reference: string }
  valueQuantity?: {
    value: number
    unit?: string
    system?: string
    code?: string
  }
  valueString?: string
  interpretation?: Array<{
    coding?: Array<{ system: string; code: string; display: string }>
  }>
  note?: Array<{ text: string }>
  _ultranos: {
    isOfflineCreated: boolean
    hlcTimestamp: string
    createdAt: string
    templateVersion: string
  }
  meta: {
    lastUpdated: string
    versionId: string
  }
}

export interface LabFhirDiagnosticReport {
  id: string
  resourceType: 'DiagnosticReport'
  status: 'preliminary' | 'registered'
  code: {
    coding?: Array<{ system?: string; code: string; display?: string }>
    text?: string
  }
  subject: { reference: string }
  issued: string
  result?: Array<{ reference: string }>
  conclusion?: string
  _ultranos: {
    createdAt: string
    hlcTimestamp: string
    isOfflineCreated: boolean
    templateVersion: string
  }
  meta: {
    lastUpdated: string
    versionId: string
  }
}

export interface LabFhirBundle {
  diagnosticReport: LabFhirDiagnosticReport
  observations: LabFhirObservation[]
}

// ---------------------------------------------------------------------------
// FHIR coding constants
// ---------------------------------------------------------------------------

const LOINC_SYSTEM = 'http://loinc.org'
const INTERPRETATION_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation'

const INTERPRETATION_DISPLAY: Record<string, string> = {
  LL: 'Critical Low',
  L: 'Low',
  N: 'Normal',
  H: 'High',
  HH: 'Critical High',
  A: 'Abnormal',
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapFhirStatus(
  resultStatus: 'draft' | 'completed',
): 'preliminary' | 'registered' {
  return resultStatus === 'completed' ? 'preliminary' : 'registered'
}

function buildObservationId(resultId: string, fieldCode: string): string {
  return `${resultId}-${fieldCode}`
}

function mapObservation(
  obs: LabObservation,
  field: TemplateField | undefined,
  result: LabResult,
  patientRef: string,
  fhirStatus: 'preliminary' | 'registered',
): LabFhirObservation {
  const now = new Date().toISOString()
  const obsId = buildObservationId(result.id, obs.fieldCode)

  // Value: numeric → valueQuantity, text/null → valueString
  const valueQuantity: LabFhirObservation['valueQuantity'] =
    typeof obs.value === 'number' && obs.value != null
      ? {
          value: obs.value,
          unit: field?.unit,
          system: field?.unit ? 'http://unitsofmeasure.org' : undefined,
        }
      : undefined

  const valueString: string | undefined =
    typeof obs.value === 'string' && obs.value !== '' ? obs.value : undefined

  // Interpretation (FHIR)
  const interpretation: LabFhirObservation['interpretation'] = obs.flag
    ? [
        {
          coding: [
            {
              system: INTERPRETATION_SYSTEM,
              code: obs.flag,
              display: INTERPRETATION_DISPLAY[obs.flag] ?? obs.flag,
            },
          ],
        },
      ]
    : undefined

  // Per-field comment → note
  const note: LabFhirObservation['note'] = obs.comment
    ? [{ text: obs.comment }]
    : undefined

  return {
    id: obsId,
    resourceType: 'Observation',
    status: fhirStatus,
    code: {
      coding: field?.loincCode && field.loincCode !== 'custom'
        ? [{ system: LOINC_SYSTEM, code: field.loincCode, display: field.code }]
        : [],
      text: obs.fieldCode,
    },
    subject: { reference: patientRef },
    ...(valueQuantity ? { valueQuantity } : {}),
    ...(valueString ? { valueString } : {}),
    ...(interpretation ? { interpretation } : {}),
    ...(note ? { note } : {}),
    _ultranos: {
      isOfflineCreated: true,
      hlcTimestamp: now, // caller may override with HLC-stamped value
      createdAt: result.enteredAt,
      templateVersion: result.templateVersion,
    },
    meta: {
      lastUpdated: now,
      versionId: '1',
    },
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Map a LabResult + its LabObservations into a FHIR bundle containing one
 * DiagnosticReport and one Observation per field.
 *
 * Draft results → status: 'registered'
 * Completed results → status: 'preliminary' (pending Story 42.5 authorization)
 *
 * @param result       - The lab result record
 * @param observations - All observations for this result
 * @param template     - The result template used during entry
 * @param sample       - The FHIR Specimen the result belongs to
 */
export function mapResultToFhirBundle(
  result: LabResult,
  observations: LabObservation[],
  template: ResultTemplate,
  sample: FhirSpecimen,
): LabFhirBundle {
  const now = new Date().toISOString()
  const fhirStatus = mapFhirStatus(result.status)
  const patientRef = sample.subject?.reference ?? ''

  // Build a lookup map from field code → TemplateField
  const fieldMap = new Map<string, TemplateField>()
  for (const f of template.fields) {
    fieldMap.set(f.code, f)
  }

  // Build Observation resources
  const fhirObservations: LabFhirObservation[] = observations.map((obs) =>
    mapObservation(obs, fieldMap.get(obs.fieldCode), result, patientRef, fhirStatus),
  )

  // Build DiagnosticReport
  const reportId = `dr-${result.id}`
  const diagnosticReport: LabFhirDiagnosticReport = {
    id: reportId,
    resourceType: 'DiagnosticReport',
    status: fhirStatus,
    code: {
      coding: template.loincCode !== 'custom'
        ? [
            {
              system: LOINC_SYSTEM,
              code: template.loincCode,
              display: template.loincDisplay,
            },
          ]
        : [],
      text: template.loincDisplay,
    },
    subject: { reference: patientRef },
    issued: now,
    result: fhirObservations.map((o) => ({ reference: `Observation/${o.id}` })),
    ...(result.reportComment ? { conclusion: result.reportComment } : {}),
    _ultranos: {
      createdAt: result.enteredAt,
      hlcTimestamp: now,
      isOfflineCreated: true,
      templateVersion: result.templateVersion,
    },
    meta: {
      lastUpdated: now,
      versionId: '1',
    },
  }

  return { diagnosticReport, observations: fhirObservations }
}
