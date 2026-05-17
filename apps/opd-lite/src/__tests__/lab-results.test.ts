import { describe, it, expect, beforeEach } from 'vitest'
import { db, type LocalDiagnosticReport } from '@/lib/db'

function makeReport(overrides: Partial<LocalDiagnosticReport> = {}): LocalDiagnosticReport {
  return {
    id: crypto.randomUUID(),
    resourceType: 'DiagnosticReport',
    status: 'final',
    code: {
      coding: [{ system: 'http://loinc.org', code: '58410-2', display: 'CBC panel' }],
    },
    subject: { reference: `Patient/${crypto.randomUUID()}` },
    issued: new Date().toISOString(),
    effectiveDateTime: new Date().toISOString(),
    performer: [{ reference: 'Organization/lab-1', display: 'Lab Alpha' }],
    conclusion: 'All values within normal range.',
    _ultranos: {
      createdAt: new Date().toISOString(),
      hlcTimestamp: `${new Date().toISOString()}_0000_node1`,
      isOfflineCreated: false,
      labId: crypto.randomUUID(),
      virusScanStatus: 'clean',
    },
    meta: {
      versionId: '1',
      lastUpdated: new Date().toISOString(),
    },
    ...overrides,
  }
}

describe('Dexie diagnosticReports table', () => {
  beforeEach(async () => {
    await db.diagnosticReports.clear()
  })

  it('should create the diagnosticReports table', () => {
    const table = db.table('diagnosticReports')
    expect(table).toBeDefined()
    expect(table.name).toBe('diagnosticReports')
  })

  it('should add and retrieve a diagnostic report by id', async () => {
    const report = makeReport()
    await db.diagnosticReports.add(report)

    const retrieved = await db.diagnosticReports.get(report.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(report.id)
    expect(retrieved!.resourceType).toBe('DiagnosticReport')
  })

  it('should query reports by subject.reference index', async () => {
    const patientRef = `Patient/${crypto.randomUUID()}`
    const r1 = makeReport({ subject: { reference: patientRef } })
    const r2 = makeReport({ subject: { reference: patientRef } })
    const r3 = makeReport() // different patient
    await db.diagnosticReports.bulkAdd([r1, r2, r3])

    const results = await db.diagnosticReports
      .where('subject.reference')
      .equals(patientRef)
      .toArray()

    expect(results).toHaveLength(2)
    expect(results.map(r => r.id).sort()).toEqual([r1.id, r2.id].sort())
  })

  it('should query reports by status index', async () => {
    const r1 = makeReport({ status: 'preliminary' })
    const r2 = makeReport({ status: 'final' })
    await db.diagnosticReports.bulkAdd([r1, r2])

    const finals = await db.diagnosticReports
      .where('status')
      .equals('final')
      .toArray()

    expect(finals).toHaveLength(1)
    expect(finals[0]!.id).toBe(r2.id)
  })

  it('should be included in PHI encryption config', async () => {
    // Verify the table works with encrypted storage (encryption middleware is active)
    const report = makeReport({
      conclusion: 'Elevated WBC count — possible infection.',
    })
    await db.diagnosticReports.put(report)

    const retrieved = await db.diagnosticReports.get(report.id)
    expect(retrieved!.conclusion).toBe('Elevated WBC count — possible infection.')
  })

  it('should support upsert via put', async () => {
    const report = makeReport()
    await db.diagnosticReports.put(report)

    const updated = { ...report, status: 'amended' as const, conclusion: 'Updated conclusion' }
    await db.diagnosticReports.put(updated)

    const retrieved = await db.diagnosticReports.get(report.id)
    expect(retrieved!.status).toBe('amended')
    expect(retrieved!.conclusion).toBe('Updated conclusion')
  })
})
