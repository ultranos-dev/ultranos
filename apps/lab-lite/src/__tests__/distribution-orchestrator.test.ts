/**
 * Story 42.6 — Distribution Orchestrator Unit Tests
 * Task 8: All 4 destinations enqueued on release; none on non-release status.
 * AC: 1, 4, 6, 10
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { distributeResult } from '../lib/distribution/orchestrator'
import type { ResultReleasedEvent } from '../lib/authorization-actions'

const mockAddDistributionQueueEntry = vi.fn()

vi.mock('../lib/db', () => ({
  addDistributionQueueEntry: (...args: unknown[]) => mockAddDistributionQueueEntry(...args),
}))

const mockAuditFn = vi.fn()

const BASE_EVENT: ResultReleasedEvent = {
  reportId: 'report-uuid-001',
  sampleId: 'LAB-20260601-0001',
  patientRef: 'Patient/patient-uuid-001',
  authorizedBy: 'supervisor-001',
  authorizedAt: '2026-06-01T10:30:00.000Z',
  loincCode: '26464-8',
  testName: 'Complete Blood Count',
  flagLevel: 'normal',
  templateVersion: '1.2.0',
}

describe('distributeResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    let idCounter = 1
    mockAddDistributionQueueEntry.mockImplementation(() => Promise.resolve(idCounter++))
  })

  it('enqueues all 4 destinations on a valid release event', async () => {
    const ids = await distributeResult(BASE_EVENT, { onAuditEvent: mockAuditFn })

    expect(ids).toHaveLength(4)
    expect(mockAddDistributionQueueEntry).toHaveBeenCalledTimes(4)

    const destinations = mockAddDistributionQueueEntry.mock.calls.map(
      (call: [{ destination: string }]) => call[0].destination,
    )
    expect(destinations).toContain('OPD_LITE')
    expect(destinations).toContain('PATIENT_LITE')
    expect(destinations).toContain('LOGBOOK')
    expect(destinations).toContain('STATS')
  })

  it('emits DISTRIBUTION_ENQUEUED audit event for each destination', async () => {
    await distributeResult(BASE_EVENT, { onAuditEvent: mockAuditFn })

    expect(mockAuditFn).toHaveBeenCalledTimes(4)
    for (const call of mockAuditFn.mock.calls) {
      expect(call[0].action).toBe('DISTRIBUTION_ENQUEUED')
      expect(call[0].reportId).toBe('report-uuid-001')
    }
  })

  it('assigns priority 3 (normal) for normal results', async () => {
    await distributeResult(BASE_EVENT, { onAuditEvent: mockAuditFn })

    const calls = mockAddDistributionQueueEntry.mock.calls
    for (const call of calls) {
      expect(call[0].priority).toBe(3)
    }
  })

  it('assigns priority 1 (critical) for critical results', async () => {
    const criticalEvent: ResultReleasedEvent = { ...BASE_EVENT, flagLevel: 'critical' }
    await distributeResult(criticalEvent, { onAuditEvent: mockAuditFn })

    const calls = mockAddDistributionQueueEntry.mock.calls
    for (const call of calls) {
      expect(call[0].priority).toBe(1)
    }
  })

  it('assigns priority 2 (abnormal) for abnormal results', async () => {
    const abnormalEvent: ResultReleasedEvent = { ...BASE_EVENT, flagLevel: 'abnormal' }
    await distributeResult(abnormalEvent, { onAuditEvent: mockAuditFn })

    const calls = mockAddDistributionQueueEntry.mock.calls
    for (const call of calls) {
      expect(call[0].priority).toBe(2)
    }
  })

  it('returns empty array and does NOT enqueue when authorizedBy is missing', async () => {
    const incomplete = { ...BASE_EVENT, authorizedBy: '' }
    const ids = await distributeResult(incomplete, { onAuditEvent: mockAuditFn })

    expect(ids).toHaveLength(0)
    expect(mockAddDistributionQueueEntry).not.toHaveBeenCalled()
  })

  it('returns empty array when reportId is missing', async () => {
    const incomplete = { ...BASE_EVENT, reportId: '' }
    const ids = await distributeResult(incomplete, { onAuditEvent: mockAuditFn })

    expect(ids).toHaveLength(0)
    expect(mockAddDistributionQueueEntry).not.toHaveBeenCalled()
  })

  it('continues with remaining destinations if one enqueue fails', async () => {
    let callCount = 0
    mockAddDistributionQueueEntry.mockImplementation(() => {
      callCount++
      if (callCount === 2) return Promise.reject(new Error('Queue full'))
      return Promise.resolve(callCount)
    })

    const ids = await distributeResult(BASE_EVENT, { onAuditEvent: mockAuditFn })
    // Should get 3 IDs (one failed)
    expect(ids).toHaveLength(3)
    expect(mockAddDistributionQueueEntry).toHaveBeenCalledTimes(4)
  })

  it('enqueues each entry with status pending and retryCount 0', async () => {
    await distributeResult(BASE_EVENT, { onAuditEvent: mockAuditFn })

    for (const call of mockAddDistributionQueueEntry.mock.calls) {
      expect(call[0].status).toBe('pending')
      expect(call[0].retryCount).toBe(0)
      expect(call[0].lastAttemptAt).toBeNull()
    }
  })

  it('payload for STATS destination contains zero PHI', async () => {
    await distributeResult(BASE_EVENT, { onAuditEvent: mockAuditFn })

    const statsCall = mockAddDistributionQueueEntry.mock.calls.find(
      (call: [{ destination: string }]) => call[0].destination === 'STATS',
    )
    expect(statsCall).toBeDefined()
    const payload = JSON.parse(statsCall[0].payload) as Record<string, unknown>
    // No patient identifiers
    expect(payload).not.toHaveProperty('patientRef')
    expect(payload).not.toHaveProperty('authorizedBy')
    expect(payload).not.toHaveProperty('sampleId')
    // Has aggregate fields only
    expect(payload).toHaveProperty('loincCode')
    expect(payload).toHaveProperty('flagLevel')
    expect(payload).toHaveProperty('yearMonth')
  })

  it('PATIENT_LITE payload does not contain performer identity', async () => {
    await distributeResult(BASE_EVENT, { onAuditEvent: mockAuditFn })

    const patientCall = mockAddDistributionQueueEntry.mock.calls.find(
      (call: [{ destination: string }]) => call[0].destination === 'PATIENT_LITE',
    )
    expect(patientCall).toBeDefined()
    const payload = JSON.parse(patientCall[0].payload) as Record<string, unknown>
    expect(payload).not.toHaveProperty('authorizedBy')
    expect(payload).not.toHaveProperty('patientRef')
    expect(payload).toHaveProperty('reportId')
    expect(payload).toHaveProperty('flagLevel')
  })
})
