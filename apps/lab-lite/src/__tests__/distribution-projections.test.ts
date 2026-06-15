/**
 * Story 42.6 — Distribution Projections Unit Tests
 * Task 8: Verify field allow-lists are enforced and no extra fields leak.
 * AC: 2, 3, 5, 6
 */
import { describe, it, expect } from 'vitest'
import {
  buildOpdProjection,
  buildPatientProjection,
  buildLogbookProjection,
  buildStatsProjection,
} from '../lib/distribution/projections'
import type { ResultReleasedEvent } from '../lib/authorization-actions'

const BASE_EVENT: ResultReleasedEvent = {
  reportId: 'report-uuid-001',
  sampleId: 'LAB-20260601-0001',
  patientRef: 'Patient/patient-uuid-001',
  authorizedBy: 'tech-001',
  authorizedAt: '2026-06-01T10:30:00.000Z',
  loincCode: '26464-8',
  testName: 'Complete Blood Count',
  flagLevel: 'normal',
  templateVersion: '1.2.0',
  receivedAt: '2026-06-01T08:00:00.000Z',
  labName: 'District Lab',
  conclusion: 'Within normal limits.',
}

const CRITICAL_EVENT: ResultReleasedEvent = {
  ...BASE_EVENT,
  flagLevel: 'critical',
  receivedAt: undefined, // test turnaround with missing receivedAt
}

describe('buildOpdProjection', () => {
  it('includes all required OPD fields', () => {
    const proj = buildOpdProjection(BASE_EVENT, 'lab-001')
    expect(proj.id).toBe('report-uuid-001')
    expect(proj.resourceType).toBe('DiagnosticReport')
    expect(proj.status).toBe('final')
    expect(proj.subject.reference).toBe('Patient/patient-uuid-001')
    expect(proj.code.coding[0].code).toBe('26464-8')
    expect(proj._ultranos.flagLevel).toBe('normal')
    expect(proj._ultranos.templateVersion).toBe('1.2.0')
    expect(proj._ultranos.sampleId).toBe('LAB-20260601-0001')
    expect(proj._ultranos.labId).toBe('lab-001')
    expect(proj.conclusion).toBe('Within normal limits.')
  })

  it('does not include patientRef in subject (only opaque reference)', () => {
    const proj = buildOpdProjection(BASE_EVENT)
    // subject.reference is the opaque patientRef — no name, no DOB
    expect(proj.subject.reference).toMatch(/^Patient\//)
    expect(JSON.stringify(proj)).not.toContain('patientFirstName')
  })

  it('strips unexpected fields', () => {
    const eventWithExtra = { ...BASE_EVENT, __secret: 'leaked', patientName: 'John' } as unknown as ResultReleasedEvent
    const proj = buildOpdProjection(eventWithExtra)
    expect(proj).not.toHaveProperty('__secret')
    expect(proj).not.toHaveProperty('patientName')
  })
})

describe('buildPatientProjection', () => {
  it('includes only allowed fields', () => {
    const proj = buildPatientProjection(BASE_EVENT)
    expect(proj.reportId).toBe('report-uuid-001')
    expect(proj.testName).toBe('Complete Blood Count')
    expect(proj.flagLevel).toBe('normal')
    expect(proj.resultSummary).toBe('Normal')
    expect(proj.issuedDate).toBe('2026-06-01') // date only, no time
    expect(proj.labName).toBe('District Lab')
  })

  it('does not include performer identity', () => {
    const proj = buildPatientProjection(BASE_EVENT)
    const json = JSON.stringify(proj)
    expect(json).not.toContain('authorizedBy')
    expect(json).not.toContain('tech-001')
    expect(json).not.toContain('patientRef')
  })

  it('does not include annotations or raw values', () => {
    const proj = buildPatientProjection(BASE_EVENT)
    expect(proj).not.toHaveProperty('conclusion')
    expect(proj).not.toHaveProperty('sampleId')
    expect(proj).not.toHaveProperty('loincCode')
  })

  it('shows correct summary for critical flag', () => {
    const proj = buildPatientProjection(CRITICAL_EVENT)
    expect(proj.resultSummary).toBe('Critical')
    expect(proj.flagLevel).toBe('critical')
  })
})

describe('buildLogbookProjection', () => {
  it('includes required MoPH register columns', () => {
    const proj = buildLogbookProjection(BASE_EVENT)
    expect(proj.diagnosticReportId).toBe('report-uuid-001')
    expect(proj.date).toBe('2026-06-01')
    expect(proj.patientRef).toBe('Patient/patient-uuid-001')
    expect(proj.testType).toBe('Complete Blood Count')
    expect(proj.technicianId).toBe('tech-001')
    expect(proj.sampleId).toBe('LAB-20260601-0001')
    expect(proj.authorizationStatus).toContain('authorized')
  })

  it('does not include result summary or clinical values', () => {
    const proj = buildLogbookProjection(BASE_EVENT)
    expect(proj).not.toHaveProperty('conclusion')
    expect(proj).not.toHaveProperty('flagLevel')
    expect(proj).not.toHaveProperty('loincCode')
  })
})

describe('buildStatsProjection', () => {
  it('contains zero PHI', () => {
    const proj = buildStatsProjection(BASE_EVENT)
    const json = JSON.stringify(proj)
    // No patient identifiers
    expect(json).not.toContain('patientRef')
    expect(json).not.toContain('Patient/')
    expect(json).not.toContain('tech-001')
    // No result values
    expect(json).not.toContain('conclusion')
    expect(json).not.toContain('resultSummary')
  })

  it('includes correct aggregate fields', () => {
    const proj = buildStatsProjection(BASE_EVENT)
    expect(proj.loincCode).toBe('26464-8')
    expect(proj.flagLevel).toBe('normal')
    expect(proj.date).toBe('2026-06-01')
    expect(proj.yearMonth).toBe('2026-06')
    // TAT: 10:30 - 08:00 = 150 minutes
    expect(proj.turnaroundMinutes).toBe(150)
  })

  it('uses 0 turnaround when receivedAt is missing', () => {
    const proj = buildStatsProjection(CRITICAL_EVENT)
    expect(proj.turnaroundMinutes).toBe(0)
  })

  it('never contains loincCode display name or test category', () => {
    const proj = buildStatsProjection(BASE_EVENT)
    expect(proj).not.toHaveProperty('testName')
    expect(proj).not.toHaveProperty('sampleId')
  })
})
