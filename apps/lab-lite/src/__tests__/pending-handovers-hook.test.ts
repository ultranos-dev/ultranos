import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { renderHook, act } from '@testing-library/react'
import { getDb, putHandoverReport, type HandoverReport } from '../lib/db'
import {
  usePendingHandovers,
  HANDOVER_ALERT_THRESHOLD_MINUTES,
} from '../hooks/usePendingHandovers'

vi.mock('../lib/audit-client', () => ({
  reportHandoverAuditEvent: vi.fn(),
}))

let uuidCounter = 0
vi.stubGlobal('crypto', { randomUUID: () => `uuid-${++uuidCounter}` })

function makeReport(overrides: Partial<HandoverReport> = {}): HandoverReport {
  return {
    id: `report-${++uuidCounter}`,
    outgoingTechId: 'tech-001',
    outgoingTechName: 'Alice',
    incomingTechId: null,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    acknowledgedAt: null,
    pendingSamples: { stat: 0, routine: 1, sampleIds: [] },
    equipmentAlerts: [],
    qcStatus: [],
    incompleteOrders: [],
    outgoingNotes: '',
    incomingNotes: null,
    shiftDate: new Date().toISOString().slice(0, 10),
    ...overrides,
  }
}

describe('usePendingHandovers', () => {
  beforeEach(async () => {
    uuidCounter = 0
    const db = getDb()
    await db.handover_reports.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns empty lists when no pending handovers exist', async () => {
    const { result } = renderHook(() => usePendingHandovers())

    // Wait for async Dexie query
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(result.current.pendingHandovers).toHaveLength(0)
    expect(result.current.expiredHandovers).toHaveLength(0)
    expect(result.current.isLoading).toBe(false)
  })

  it('returns pending handovers from Dexie', async () => {
    const report = makeReport()
    await putHandoverReport(report)

    const { result } = renderHook(() => usePendingHandovers())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(result.current.pendingHandovers).toHaveLength(1)
    expect(result.current.pendingHandovers[0].id).toBe(report.id)
  })

  it('does not return ACKNOWLEDGED reports as pending', async () => {
    await putHandoverReport(makeReport({ status: 'ACKNOWLEDGED' }))
    const pending = makeReport({ status: 'PENDING' })
    await putHandoverReport(pending)

    const { result } = renderHook(() => usePendingHandovers())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(result.current.pendingHandovers).toHaveLength(1)
    expect(result.current.pendingHandovers[0].id).toBe(pending.id)
  })

  it(`marks handovers older than ${HANDOVER_ALERT_THRESHOLD_MINUTES} min as expired alerts`, async () => {
    const oldTime = new Date(
      Date.now() - (HANDOVER_ALERT_THRESHOLD_MINUTES + 5) * 60 * 1000,
    ).toISOString()
    const oldReport = makeReport({ createdAt: oldTime })
    const newReport = makeReport() // now
    await putHandoverReport(oldReport)
    await putHandoverReport(newReport)

    const { result } = renderHook(() => usePendingHandovers())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(result.current.pendingHandovers).toHaveLength(2)
    expect(result.current.expiredHandovers).toHaveLength(1)
    expect(result.current.expiredHandovers[0].id).toBe(oldReport.id)
  })

  it('does not include fresh handovers in expiredHandovers', async () => {
    await putHandoverReport(makeReport()) // created now

    const { result } = renderHook(() => usePendingHandovers())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(result.current.expiredHandovers).toHaveLength(0)
  })
})
