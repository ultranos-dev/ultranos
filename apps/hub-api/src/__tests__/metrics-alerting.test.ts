import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the alert notifier
const mockSendAlert = vi.fn()
vi.mock('../lib/alert-notifier', () => ({
  sendAlert: (...args: unknown[]) => mockSendAlert(...args),
}))

// Mock prom-client with controllable histogram values
let mockHistogramValues: Array<{ labels: Record<string, string>; value: number }> = []
let mockCounterValues: Array<{ labels: Record<string, string>; value: number }> = []

vi.mock('../trpc/middleware/metrics', () => ({
  getRequestDurationHistogram: vi.fn().mockReturnValue({
    get: vi.fn().mockImplementation(async () => ({
      values: mockHistogramValues,
    })),
  }),
  getRequestTotalCounter: vi.fn().mockReturnValue({
    get: vi.fn().mockImplementation(async () => ({
      values: mockCounterValues,
    })),
  }),
  getRequestErrorsCounter: vi.fn().mockReturnValue({
    get: vi.fn().mockImplementation(async () => ({
      values: mockCounterValues,
    })),
  }),
}))

import {
  evaluateP95Alerts,
  evaluateErrorRateAlerts,
  _resetAlertState,
} from '../lib/metrics-alerting'

describe('P95 Latency Alerting — Story 23.1 Task 4', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetAlertState()
    mockHistogramValues = []
    mockCounterValues = []
  })

  it('fires P2 alert when read procedure P95 exceeds 500ms', async () => {
    // Simulate a histogram where P95 for a query is 650ms
    // prom-client histogram values include bucket boundaries
    mockHistogramValues = [
      // Bucket le=500 has 90 of 100 requests (90th percentile inside, P95 outside)
      { labels: { router: 'patient', procedure: 'getById', type: 'query', status: 'ok', le: '100' }, value: 20 },
      { labels: { router: 'patient', procedure: 'getById', type: 'query', status: 'ok', le: '250' }, value: 50 },
      { labels: { router: 'patient', procedure: 'getById', type: 'query', status: 'ok', le: '500' }, value: 90 },
      { labels: { router: 'patient', procedure: 'getById', type: 'query', status: 'ok', le: '1000' }, value: 98 },
      { labels: { router: 'patient', procedure: 'getById', type: 'query', status: 'ok', le: '2500' }, value: 100 },
      { labels: { router: 'patient', procedure: 'getById', type: 'query', status: 'ok', le: '+Inf' }, value: 100 },
    ]

    await evaluateP95Alerts()

    expect(mockSendAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'P2',
        title: expect.stringContaining('P95'),
        metric: 'trpc_request_duration_ms',
      }),
    )
  })

  it('fires P2 alert when write procedure P95 exceeds 1000ms', async () => {
    mockHistogramValues = [
      { labels: { router: 'patient', procedure: 'create', type: 'mutation', status: 'ok', le: '100' }, value: 10 },
      { labels: { router: 'patient', procedure: 'create', type: 'mutation', status: 'ok', le: '500' }, value: 40 },
      { labels: { router: 'patient', procedure: 'create', type: 'mutation', status: 'ok', le: '1000' }, value: 90 },
      { labels: { router: 'patient', procedure: 'create', type: 'mutation', status: 'ok', le: '2500' }, value: 98 },
      { labels: { router: 'patient', procedure: 'create', type: 'mutation', status: 'ok', le: '5000' }, value: 100 },
      { labels: { router: 'patient', procedure: 'create', type: 'mutation', status: 'ok', le: '+Inf' }, value: 100 },
    ]

    await evaluateP95Alerts()

    expect(mockSendAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'P2',
        title: expect.stringContaining('P95'),
      }),
    )
  })

  it('does NOT fire alert when P95 is within threshold', async () => {
    mockHistogramValues = [
      // P95 is well under 500ms (96 of 100 are under 250ms)
      { labels: { router: 'patient', procedure: 'getById', type: 'query', status: 'ok', le: '100' }, value: 80 },
      { labels: { router: 'patient', procedure: 'getById', type: 'query', status: 'ok', le: '250' }, value: 96 },
      { labels: { router: 'patient', procedure: 'getById', type: 'query', status: 'ok', le: '500' }, value: 99 },
      { labels: { router: 'patient', procedure: 'getById', type: 'query', status: 'ok', le: '1000' }, value: 100 },
      { labels: { router: 'patient', procedure: 'getById', type: 'query', status: 'ok', le: '+Inf' }, value: 100 },
    ]

    await evaluateP95Alerts()

    expect(mockSendAlert).not.toHaveBeenCalled()
  })

  it('auto-resolves when P95 drops below threshold', async () => {
    // First: trigger alert
    mockHistogramValues = [
      { labels: { router: 'patient', procedure: 'getById', type: 'query', status: 'ok', le: '500' }, value: 90 },
      { labels: { router: 'patient', procedure: 'getById', type: 'query', status: 'ok', le: '1000' }, value: 98 },
      { labels: { router: 'patient', procedure: 'getById', type: 'query', status: 'ok', le: '+Inf' }, value: 100 },
    ]
    await evaluateP95Alerts()
    expect(mockSendAlert).toHaveBeenCalledTimes(1)
    vi.clearAllMocks()

    // Then: values drop below threshold — should auto-resolve
    mockHistogramValues = [
      { labels: { router: 'patient', procedure: 'getById', type: 'query', status: 'ok', le: '250' }, value: 96 },
      { labels: { router: 'patient', procedure: 'getById', type: 'query', status: 'ok', le: '500' }, value: 100 },
      { labels: { router: 'patient', procedure: 'getById', type: 'query', status: 'ok', le: '+Inf' }, value: 100 },
    ]

    // Simulate 5 consecutive healthy evaluations for auto-resolve
    for (let i = 0; i < 5; i++) {
      await evaluateP95Alerts()
    }

    expect(mockSendAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('RESOLVED'),
      }),
    )
  })
})

describe('Error Rate Alerting — Story 23.1 Task 5', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetAlertState()
    mockHistogramValues = []
    mockCounterValues = []
  })

  it('fires P2 alert when error rate exceeds 1% over 5-minute window', async () => {
    await evaluateErrorRateAlerts(20, 1000) // 2% error rate (20 errors / 1000 total)

    expect(mockSendAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'P2',
        title: expect.stringContaining('Error Rate'),
      }),
    )
  })

  it('does NOT fire alert when error rate is under 1%', async () => {
    await evaluateErrorRateAlerts(5, 1000) // 0.5% error rate

    expect(mockSendAlert).not.toHaveBeenCalled()
  })

  it('debounces — no duplicate alerts within 15 minutes', async () => {
    // First alert fires
    await evaluateErrorRateAlerts(1020, 1000)
    expect(mockSendAlert).toHaveBeenCalledTimes(1)

    // Second call within debounce window should not re-alert
    await evaluateErrorRateAlerts(30, 1000)
    expect(mockSendAlert).toHaveBeenCalledTimes(1)
  })

  it('auto-resolves when error rate drops below 1%', async () => {
    // Trigger alert
    await evaluateErrorRateAlerts(1020, 1000)
    expect(mockSendAlert).toHaveBeenCalledTimes(1)
    vi.clearAllMocks()

    // 5 consecutive healthy evaluations
    for (let i = 0; i < 5; i++) {
      await evaluateErrorRateAlerts(3, 1000)
    }

    expect(mockSendAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('RESOLVED'),
      }),
    )
  })
})
