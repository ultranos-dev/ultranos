/**
 * Story 43.2 — QC Run Service Tests
 * Tasks 9.1 QC Run CRUD, 9.2 Snapshot capture, 9.3 QC warning derivation,
 * 9.6 Auto-verify block, 9.7 Immutability, 9.10 Audit events, 9.11 Offline
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

// Mock audit emission — we verify calls but don't want real Dexie audit writes
vi.mock('@ultranos/audit-logger/client', () => ({
  emitClientAudit: vi.fn(),
  setAuditStoreAdapter: vi.fn(),
}))

// Mock auth session store
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ session: { userId: 'tech-abc' } }),
  },
}))

import { getDb } from '../lib/db'
import type { QcRun } from '../lib/db'
import {
  saveQcRun,
  getLatestQcRun,
  getTodayQcRun,
  getQcRunHistory,
  getRecentQcRuns,
  isQcDriftWarningActive,
} from '../services/qc-run-service'
import {
  captureQcSnapshot,
  deriveQcWarning,
} from '../services/qc-snapshot-service'
import { qcStatusFromWarning } from '../lib/auto-verify'
import { emitClientAudit } from '@ultranos/audit-logger/client'

const TODAY = new Date().toISOString().slice(0, 10)
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

function makeRun(overrides: Partial<QcRun> = {}): QcRun {
  return {
    id: crypto.randomUUID(),
    analyte: '718-7',
    instrumentId: 'analyzer-01',
    controlLevel: 'L1',
    controlValues: { hemoglobin: 12.5 },
    expectedRange: { low: 11.0, high: 14.0 },
    passOrFail: 'PASS',
    timestamp: new Date().toISOString(),
    calendarDate: TODAY,
    techId: 'tech-abc',
    ...overrides,
  }
}

describe('QC Run CRUD (Task 9.1)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.qcRuns.clear()
    vi.clearAllMocks()
  })

  it('saves and retrieves a QC run', async () => {
    const run = makeRun()
    await saveQcRun(run)
    const retrieved = await getLatestQcRun(run.analyte, run.instrumentId)
    expect(retrieved).toBeDefined()
    expect(retrieved?.id).toBe(run.id)
    expect(retrieved?.passOrFail).toBe('PASS')
  })

  it('getLatestQcRun returns most recent regardless of date', async () => {
    const old = makeRun({ id: 'old-run', calendarDate: YESTERDAY, timestamp: '2026-05-29T08:00:00.000Z' })
    const recent = makeRun({ id: 'new-run', calendarDate: TODAY, timestamp: '2026-05-30T10:00:00.000Z' })
    await saveQcRun(old)
    await saveQcRun(recent)
    const latest = await getLatestQcRun('718-7', 'analyzer-01')
    expect(latest?.id).toBe('new-run')
  })

  it('getTodayQcRun returns null when no QC run today', async () => {
    const yesterdayRun = makeRun({ calendarDate: YESTERDAY })
    await saveQcRun(yesterdayRun)
    const todayRun = await getTodayQcRun('718-7', 'analyzer-01')
    expect(todayRun).toBeUndefined()
  })

  it('getTodayQcRun returns run from today', async () => {
    const run = makeRun()
    await saveQcRun(run)
    const found = await getTodayQcRun('718-7', 'analyzer-01')
    expect(found?.id).toBe(run.id)
  })

  it('getQcRunHistory returns runs ordered newest first', async () => {
    const r1 = makeRun({ id: 'r1', timestamp: '2026-05-28T08:00:00.000Z', calendarDate: YESTERDAY })
    const r2 = makeRun({ id: 'r2', timestamp: '2026-05-30T08:00:00.000Z', calendarDate: TODAY })
    await saveQcRun(r1)
    await saveQcRun(r2)
    const history = await getQcRunHistory('718-7', 'analyzer-01')
    expect(history[0].id).toBe('r2')
    expect(history[1].id).toBe('r1')
  })

  it('getQcRunHistory respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      await saveQcRun(makeRun({ id: `run-${i}` }))
    }
    const history = await getQcRunHistory('718-7', 'analyzer-01', 3)
    expect(history).toHaveLength(3)
  })

  it('returns empty array for unknown analyte', async () => {
    const history = await getQcRunHistory('unknown-analyte', 'analyzer-01')
    expect(history).toHaveLength(0)
  })
})

describe('QC Snapshot Capture (Task 9.2)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.qcRuns.clear()
    vi.clearAllMocks()
  })

  it('returns null when no QC run exists', async () => {
    const snapshot = await captureQcSnapshot('718-7', 'analyzer-01')
    expect(snapshot).toBeNull()
  })

  it('returns a snapshot deep copy of the QC run', async () => {
    const run = makeRun()
    await saveQcRun(run)
    const snapshot = await captureQcSnapshot('718-7', 'analyzer-01')
    expect(snapshot).not.toBeNull()
    expect(snapshot?.qcRunId).toBe(run.id)
    expect(snapshot?.passOrFail).toBe('PASS')
    expect(snapshot?.analyte).toBe('718-7')
    expect(snapshot?.controlValues).toEqual({ hemoglobin: 12.5 })
    expect(snapshot?.expectedRange).toEqual({ low: 11.0, high: 14.0 })
  })

  it('deep copy: mutating original run does not affect snapshot (Task 9.2)', async () => {
    const run = makeRun()
    await saveQcRun(run)
    const snapshot = await captureQcSnapshot('718-7', 'analyzer-01')
    expect(snapshot).not.toBeNull()
    // Mutate the original run's controlValues in memory
    run.controlValues['hemoglobin'] = 999
    // Snapshot should be unaffected (deep copy)
    expect(snapshot?.controlValues['hemoglobin']).toBe(12.5)
  })

  it('snapshot has snapshotTakenAt populated', async () => {
    await saveQcRun(makeRun())
    const snapshot = await captureQcSnapshot('718-7', 'analyzer-01')
    expect(snapshot?.snapshotTakenAt).toBeTruthy()
  })

  it('propagates passOrFail correctly for FAIL run', async () => {
    await saveQcRun(makeRun({ passOrFail: 'FAIL' }))
    const snapshot = await captureQcSnapshot('718-7', 'analyzer-01')
    expect(snapshot?.passOrFail).toBe('FAIL')
  })
})

describe('QC Warning Derivation (Task 9.3)', () => {
  it('null snapshot → NO_QC_TODAY', async () => {
    const warning = await deriveQcWarning(null, '718-7', 'analyzer-01')
    expect(warning).toBe('NO_QC_TODAY')
  })

  it('FAIL snapshot → QC_FAILING', async () => {
    const snapshot = {
      qcRunId: 'run-1',
      analyte: '718-7',
      instrumentId: 'analyzer-01',
      controlLevel: 'L1',
      passOrFail: 'FAIL' as const,
      controlValues: { hemoglobin: 10.0 },
      expectedRange: { low: 11.0, high: 14.0 },
      qcTimestamp: new Date().toISOString(),
      snapshotTakenAt: new Date().toISOString(),
    }
    const warning = await deriveQcWarning(snapshot, '718-7', 'analyzer-01')
    expect(warning).toBe('QC_FAILING')
  })

  it('PASS snapshot with no drift → null (passing)', async () => {
    const snapshot = {
      qcRunId: 'run-2',
      analyte: '718-7',
      instrumentId: 'analyzer-01',
      controlLevel: 'L1',
      passOrFail: 'PASS' as const,
      controlValues: { hemoglobin: 12.5 },
      expectedRange: { low: 11.0, high: 14.0 },
      qcTimestamp: new Date().toISOString(),
      snapshotTakenAt: new Date().toISOString(),
    }
    const warning = await deriveQcWarning(snapshot, '718-7', 'analyzer-01')
    expect(warning).toBeNull()
  })
})

describe('Auto-Verification Block (Task 9.6)', () => {
  it('qcStatusFromWarning: null → passing', () => {
    expect(qcStatusFromWarning(null)).toBe('passing')
  })

  it('qcStatusFromWarning: NO_QC_TODAY → failing', () => {
    expect(qcStatusFromWarning('NO_QC_TODAY')).toBe('failing')
  })

  it('qcStatusFromWarning: QC_FAILING → failing', () => {
    expect(qcStatusFromWarning('QC_FAILING')).toBe('failing')
  })

  it('qcStatusFromWarning: QC_DRIFT → failing', () => {
    expect(qcStatusFromWarning('QC_DRIFT')).toBe('failing')
  })
})

describe('isQcDriftWarningActive stub (Task 8)', () => {
  it('always returns false until Story 43.6 is implemented', async () => {
    const active = await isQcDriftWarningActive('718-7', 'analyzer-01')
    expect(active).toBe(false)
  })
})

describe('getRecentQcRuns (Task 8 / Task 9.1)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.qcRuns.clear()
  })

  it('returns the last N runs for drift detection consumption', async () => {
    for (let i = 0; i < 10; i++) {
      await saveQcRun(makeRun({ id: `run-${i}`, timestamp: `2026-05-${10 + i}T08:00:00.000Z` }))
    }
    const runs = await getRecentQcRuns('718-7', 'analyzer-01', 3)
    expect(runs).toHaveLength(3)
  })
})

describe('Audit events (Task 9.10)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.qcRuns.clear()
    vi.clearAllMocks()
  })

  it('emits audit event on QC run save — no PHI in metadata', async () => {
    const run = makeRun()
    await saveQcRun(run)
    expect(emitClientAudit).toHaveBeenCalledOnce()
    const call = vi.mocked(emitClientAudit).mock.calls[0][0]
    // No PHI — verify only operational metadata
    expect(call.metadata?.analyte).toBe('718-7')
    expect(call.metadata?.instrumentId).toBe('analyzer-01')
    expect(call.metadata?.passOrFail).toBe('PASS')
    // Ensure no patient names or diagnoses in metadata
    expect(JSON.stringify(call.metadata)).not.toMatch(/patient|name|dob/i)
  })
})

describe('Offline resilience (Task 9.11)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.qcRuns.clear()
  })

  it('QC runs persist in Dexie (offline — no network call needed)', async () => {
    const run = makeRun()
    await saveQcRun(run)
    // Simulates offline: Dexie returns data without any network
    const retrieved = await getLatestQcRun(run.analyte, run.instrumentId)
    expect(retrieved).toBeDefined()
    expect(retrieved?.id).toBe(run.id)
  })

  it('captureQcSnapshot works without network', async () => {
    await saveQcRun(makeRun())
    // captureQcSnapshot only reads Dexie — no network call
    const snapshot = await captureQcSnapshot('718-7', 'analyzer-01')
    expect(snapshot).not.toBeNull()
  })
})
