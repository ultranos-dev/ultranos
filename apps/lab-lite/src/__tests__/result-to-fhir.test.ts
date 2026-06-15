import { describe, it, expect } from 'vitest'
import { mapResultToFhirBundle } from '../lib/result-to-fhir'
import type { LabResult, LabObservation } from '../lib/db'
import { TEMPLATE_REGISTRY } from '../lib/result-templates'

const CBC = TEMPLATE_REGISTRY['58410-2']

const MOCK_RESULT: LabResult = {
  id: 'result-uuid-001',
  sampleId: 'sample-uuid-001',
  templateId: 'tpl-cbc-v1.0.0',
  templateVersion: '1.0.0',
  status: 'completed',
  enteredBy: 'practitioner-001',
  enteredAt: '2026-05-30T10:00:00.000Z',
  updatedAt: '2026-05-30T10:05:00.000Z',
  reportComment: 'Normal CBC panel',
}

const MOCK_OBSERVATIONS: LabObservation[] = [
  { id: 'obs-001', resultId: 'result-uuid-001', fieldCode: 'wbc', value: 7.0, flag: null },
  { id: 'obs-002', resultId: 'result-uuid-001', fieldCode: 'rbc', value: 4.8, flag: null },
  { id: 'obs-003', resultId: 'result-uuid-001', fieldCode: 'hgb', value: 14.0, flag: null },
  { id: 'obs-004', resultId: 'result-uuid-001', fieldCode: 'hct', value: 42.0, flag: null },
  { id: 'obs-005', resultId: 'result-uuid-001', fieldCode: 'plt', value: 280, flag: null },
  { id: 'obs-006', resultId: 'result-uuid-001', fieldCode: 'mcv', value: 87.5, flag: null },
  { id: 'obs-007', resultId: 'result-uuid-001', fieldCode: 'mch', value: 29.2, flag: null },
  { id: 'obs-008', resultId: 'result-uuid-001', fieldCode: 'mchc', value: 33.3, flag: null },
]

const MOCK_SAMPLE = {
  id: 'sample-uuid-001',
  subject: { reference: 'Patient/patient-uuid-001' },
  _ultranos: {
    labSampleId: 'LAB-2026-0001',
    pipelineStatus: 'in_processing' as const,
  },
}

describe('mapResultToFhirBundle', () => {
  it('returns a bundle with one DiagnosticReport and N Observations', () => {
    const bundle = mapResultToFhirBundle(MOCK_RESULT, MOCK_OBSERVATIONS, CBC, MOCK_SAMPLE as any)
    expect(bundle.diagnosticReport).toBeDefined()
    expect(bundle.observations).toHaveLength(MOCK_OBSERVATIONS.length)
  })

  it('DiagnosticReport has correct resourceType and status', () => {
    const { diagnosticReport } = mapResultToFhirBundle(MOCK_RESULT, MOCK_OBSERVATIONS, CBC, MOCK_SAMPLE as any)
    expect(diagnosticReport.resourceType).toBe('DiagnosticReport')
    expect(diagnosticReport.status).toBe('preliminary')
  })

  it('DiagnosticReport code uses the template LOINC code', () => {
    const { diagnosticReport } = mapResultToFhirBundle(MOCK_RESULT, MOCK_OBSERVATIONS, CBC, MOCK_SAMPLE as any)
    expect(diagnosticReport.code.coding?.[0]?.code).toBe('58410-2')
  })

  it('DiagnosticReport result array references each Observation by id', () => {
    const { diagnosticReport, observations } = mapResultToFhirBundle(MOCK_RESULT, MOCK_OBSERVATIONS, CBC, MOCK_SAMPLE as any)
    expect(diagnosticReport.result).toHaveLength(observations.length)
    for (const ref of diagnosticReport.result ?? []) {
      expect(ref.reference).toMatch(/^Observation\//)
    }
  })

  it('DiagnosticReport _ultranos carries templateVersion', () => {
    const { diagnosticReport } = mapResultToFhirBundle(MOCK_RESULT, MOCK_OBSERVATIONS, CBC, MOCK_SAMPLE as any)
    expect(diagnosticReport._ultranos.templateVersion).toBe('1.0.0')
    expect(diagnosticReport._ultranos.isOfflineCreated).toBe(true)
  })

  it('DiagnosticReport subject matches sample subject', () => {
    const { diagnosticReport } = mapResultToFhirBundle(MOCK_RESULT, MOCK_OBSERVATIONS, CBC, MOCK_SAMPLE as any)
    expect(diagnosticReport.subject.reference).toBe('Patient/patient-uuid-001')
  })

  it('each Observation has resourceType=Observation and status=preliminary', () => {
    const { observations } = mapResultToFhirBundle(MOCK_RESULT, MOCK_OBSERVATIONS, CBC, MOCK_SAMPLE as any)
    for (const obs of observations) {
      expect(obs.resourceType).toBe('Observation')
      expect(obs.status).toBe('preliminary')
    }
  })

  it('Observation for numeric field uses valueQuantity', () => {
    const { observations } = mapResultToFhirBundle(MOCK_RESULT, MOCK_OBSERVATIONS, CBC, MOCK_SAMPLE as any)
    const wbcObs = observations.find((o) => o.code.coding?.[0]?.code === '6690-2')
    expect(wbcObs).toBeDefined()
    expect(wbcObs!.valueQuantity?.value).toBe(7.0)
    expect(wbcObs!.valueQuantity?.unit).toBe('10³/μL')
  })

  it('Observation with flag carries interpretation code', () => {
    const obsWithFlag: LabObservation[] = [
      ...MOCK_OBSERVATIONS.slice(0, -1),
      { id: 'obs-008', resultId: 'result-uuid-001', fieldCode: 'wbc', value: 35.0, flag: 'HH' },
    ]
    const { observations } = mapResultToFhirBundle(MOCK_RESULT, obsWithFlag, CBC, MOCK_SAMPLE as any)
    const flaggedObs = observations.find((o) =>
      o.interpretation?.some((i) => i.coding?.some((c) => c.code === 'HH'))
    )
    expect(flaggedObs).toBeDefined()
  })

  it('Observation subject matches sample subject', () => {
    const { observations } = mapResultToFhirBundle(MOCK_RESULT, MOCK_OBSERVATIONS, CBC, MOCK_SAMPLE as any)
    for (const obs of observations) {
      expect(obs.subject?.reference).toBe('Patient/patient-uuid-001')
    }
  })

  it('draft result produces status=registered on observations', () => {
    const draftResult: LabResult = { ...MOCK_RESULT, status: 'draft' }
    const { diagnosticReport, observations } = mapResultToFhirBundle(draftResult, MOCK_OBSERVATIONS, CBC, MOCK_SAMPLE as any)
    expect(diagnosticReport.status).toBe('registered')
    for (const obs of observations) {
      expect(obs.status).toBe('registered')
    }
  })
})
