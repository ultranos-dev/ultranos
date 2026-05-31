/**
 * Story 43.2 — QC Immutability Tests (Task 9.7)
 * qcSnapshot and qcWarning fields are write-once on LabResult:
 * once set they must never be overwritten by subsequent putLabResult calls.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

import { getDb, putLabResult } from '@/lib/db'
import type { LabResult, QcSnapshot } from '@/lib/db'

function makeResult(overrides: Partial<LabResult> = {}): LabResult {
  return {
    id: 'result-imm-001',
    sampleId: 'sample-001',
    templateId: 'template-hgb',
    templateVersion: '1',
    status: 'draft',
    enteredBy: 'tech-abc',
    enteredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

const qcSnapshot: QcSnapshot = {
  qcRunId: 'run-001',
  analyte: '718-7',
  instrumentId: 'analyzer-01',
  controlLevel: 'L1',
  passOrFail: 'PASS',
  controlValues: { hemoglobin: 12.5 },
  expectedRange: { low: 11.0, high: 14.0 },
  qcTimestamp: new Date().toISOString(),
  snapshotTakenAt: new Date().toISOString(),
}

beforeEach(async () => {
  const db = getDb()
  await db.lab_results.clear()
})

describe('QC Snapshot Immutability (Task 9.7)', () => {
  it('preserves qcSnapshot when a subsequent put omits it', async () => {
    // Initial save with qcSnapshot attached
    await putLabResult(makeResult({ qcSnapshot, qcWarning: 'QC_FAILING' }))

    // Subsequent put that omits qcSnapshot (simulates a status-only update)
    await putLabResult(makeResult({ status: 'completed', qcSnapshot: undefined, qcWarning: undefined }))

    const db = getDb()
    const stored = await db.lab_results.get('result-imm-001')
    expect(stored?.qcSnapshot).toEqual(qcSnapshot)
    expect(stored?.qcWarning).toBe('QC_FAILING')
  })

  it('preserves qcSnapshot when a subsequent put sets qcSnapshot to null', async () => {
    await putLabResult(makeResult({ qcSnapshot, qcWarning: 'QC_FAILING' }))

    // Attempt to nullify the snapshot
    await putLabResult(makeResult({ qcSnapshot: null, qcWarning: null }))

    const db = getDb()
    const stored = await db.lab_results.get('result-imm-001')
    expect(stored?.qcSnapshot).toEqual(qcSnapshot)
    expect(stored?.qcWarning).toBe('QC_FAILING')
  })

  it('preserves NO_QC_TODAY warning when subsequent put omits qcWarning', async () => {
    await putLabResult(makeResult({ qcSnapshot: null, qcWarning: 'NO_QC_TODAY' }))

    await putLabResult(makeResult({ status: 'completed', qcWarning: undefined }))

    const db = getDb()
    const stored = await db.lab_results.get('result-imm-001')
    expect(stored?.qcWarning).toBe('NO_QC_TODAY')
  })

  it('initial save with no qcSnapshot — subsequent put can set qcSnapshot (first-write wins)', async () => {
    // First save: no QC data yet
    await putLabResult(makeResult({ qcSnapshot: undefined, qcWarning: undefined }))

    // Second put: attaches QC data for the first time
    await putLabResult(makeResult({ qcSnapshot, qcWarning: 'QC_FAILING' }))

    const db = getDb()
    const stored = await db.lab_results.get('result-imm-001')
    // Since initial record had undefined qcSnapshot, the update should set it
    expect(stored?.qcSnapshot).toEqual(qcSnapshot)
    expect(stored?.qcWarning).toBe('QC_FAILING')
  })

  it('new record (no prior state) is saved as-is', async () => {
    await putLabResult(makeResult({ id: 'new-result', qcSnapshot, qcWarning: 'QC_FAILING' }))

    const db = getDb()
    const stored = await db.lab_results.get('new-result')
    expect(stored?.qcSnapshot).toEqual(qcSnapshot)
    expect(stored?.qcWarning).toBe('QC_FAILING')
  })

  it('non-QC fields ARE updatable after initial save', async () => {
    await putLabResult(makeResult({ qcSnapshot, qcWarning: null, status: 'draft' }))

    // Update the status (legitimate mutable field)
    await putLabResult(makeResult({ qcSnapshot, qcWarning: null, status: 'completed' }))

    const db = getDb()
    const stored = await db.lab_results.get('result-imm-001')
    // Status updated, QC fields preserved
    expect(stored?.status).toBe('completed')
    expect(stored?.qcSnapshot).toEqual(qcSnapshot)
  })
})
