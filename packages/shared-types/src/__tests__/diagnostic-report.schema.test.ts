import { describe, it, expect } from 'vitest'
import { FhirDiagnosticReportSchema } from '../fhir/diagnostic-report.schema.js'

describe('FhirDiagnosticReportSchema', () => {
  const validReport = {
    id: '550e8400-e29b-41d4-a716-446655440030',
    resourceType: 'DiagnosticReport' as const,
    status: 'final' as const,
    code: {
      coding: [{ system: 'http://loinc.org', code: '58410-2', display: 'CBC panel' }],
      text: 'Complete Blood Count',
    },
    subject: { reference: 'Patient/550e8400-e29b-41d4-a716-446655440000' },
    issued: '2025-06-15T14:30:00Z',
    performer: [
      { reference: 'Practitioner/550e8400-e29b-41d4-a716-446655440001' },
    ],
    result: [
      { reference: 'Observation/550e8400-e29b-41d4-a716-446655440010' },
    ],
    conclusion: 'All values within normal range',
    _ultranos: {
      createdAt: '2025-06-15T14:30:00Z',
      hlcTimestamp: '000001718457000:00000:lab-node-1',
      isOfflineCreated: false,
    },
    meta: {
      lastUpdated: '2025-06-15T14:30:00Z',
    },
  }

  it('accepts a valid DiagnosticReport resource', () => {
    const result = FhirDiagnosticReportSchema.safeParse(validReport)
    expect(result.success).toBe(true)
  })

  it('requires resourceType to be DiagnosticReport', () => {
    const result = FhirDiagnosticReportSchema.safeParse({
      ...validReport,
      resourceType: 'Patient',
    })
    expect(result.success).toBe(false)
  })

  it('validates status enum', () => {
    const result = FhirDiagnosticReportSchema.safeParse({
      ...validReport,
      status: 'invalid',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing required fields', () => {
    const { code: _, ...noCode } = validReport
    expect(FhirDiagnosticReportSchema.safeParse(noCode).success).toBe(false)

    const { subject: _s, ...noSubject } = validReport
    expect(FhirDiagnosticReportSchema.safeParse(noSubject).success).toBe(false)

    const { issued: _i, ...noIssued } = validReport
    expect(FhirDiagnosticReportSchema.safeParse(noIssued).success).toBe(false)

    const { _ultranos: _u, ...noExt } = validReport
    expect(FhirDiagnosticReportSchema.safeParse(noExt).success).toBe(false)

    const { meta: _m, ...noMeta } = validReport
    expect(FhirDiagnosticReportSchema.safeParse(noMeta).success).toBe(false)
  })

  it('accepts optional fields when omitted', () => {
    const minimal = {
      id: '550e8400-e29b-41d4-a716-446655440030',
      resourceType: 'DiagnosticReport' as const,
      status: 'preliminary' as const,
      code: { text: 'Urinalysis' },
      subject: { reference: 'Patient/550e8400-e29b-41d4-a716-446655440000' },
      issued: '2025-06-15T14:30:00Z',
      _ultranos: {
        createdAt: '2025-06-15T14:30:00Z',
        hlcTimestamp: '000001718457000:00000:lab-node-1',
        isOfflineCreated: true,
      },
      meta: { lastUpdated: '2025-06-15T14:30:00Z' },
    }
    const result = FhirDiagnosticReportSchema.safeParse(minimal)
    expect(result.success).toBe(true)
  })

  it('accepts all FHIR R4 DiagnosticReport statuses', () => {
    const statuses = [
      'registered', 'partial', 'preliminary', 'final',
      'amended', 'corrected', 'appended', 'cancelled',
      'entered-in-error', 'unknown',
    ]
    for (const status of statuses) {
      const result = FhirDiagnosticReportSchema.safeParse({ ...validReport, status })
      expect(result.success).toBe(true)
    }
  })

  it('validates _ultranos virusScanStatus enum', () => {
    const withScan = {
      ...validReport,
      _ultranos: { ...validReport._ultranos, virusScanStatus: 'clean' },
    }
    expect(FhirDiagnosticReportSchema.safeParse(withScan).success).toBe(true)

    const badScan = {
      ...validReport,
      _ultranos: { ...validReport._ultranos, virusScanStatus: 'bad-value' },
    }
    expect(FhirDiagnosticReportSchema.safeParse(badScan).success).toBe(false)
  })

  it('validates presentedForm attachments', () => {
    const withAttachment = {
      ...validReport,
      presentedForm: [
        { contentType: 'application/pdf', title: 'Lab Report', size: 1024 },
      ],
    }
    expect(FhirDiagnosticReportSchema.safeParse(withAttachment).success).toBe(true)
  })

  it('rejects empty CodeableConcept for code', () => {
    const result = FhirDiagnosticReportSchema.safeParse({
      ...validReport,
      code: {},
    })
    expect(result.success).toBe(false)
  })
})
