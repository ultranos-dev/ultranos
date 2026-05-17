import { describe, it, expect, beforeEach, vi } from 'vitest'

// We need to mock prom-client before importing the middleware
vi.mock('prom-client', () => {
  const histogramObserve = vi.fn()
  const counterInc = vi.fn()

  return {
    Histogram: vi.fn().mockImplementation(() => ({
      observe: histogramObserve,
      get: vi.fn().mockResolvedValue({ values: [] }),
    })),
    Counter: vi.fn().mockImplementation(() => ({
      inc: counterInc,
    })),
    Registry: vi.fn().mockImplementation(() => ({
      metrics: vi.fn().mockResolvedValue(''),
      contentType: 'text/plain',
      registerMetric: vi.fn(),
    })),
    collectDefaultMetrics: vi.fn(),
    _histogramObserve: histogramObserve,
    _counterInc: counterInc,
  }
})

import { metricsMiddleware, getMetricsRegistry } from '../trpc/middleware/metrics'

describe('tRPC Metrics Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('records duration and status for successful procedure calls', async () => {
    const mockNext = vi.fn().mockResolvedValue({ data: 'ok' })
    const opts = {
      ctx: {},
      path: 'patient.getById',
      type: 'query' as const,
      rawInput: undefined,
      next: mockNext,
    }

    await metricsMiddleware(opts)

    expect(mockNext).toHaveBeenCalled()

    // The middleware should have called histogram.observe and counter.inc
    const promClient = await import('prom-client')
    const histogramObserve = (promClient as any)._histogramObserve
    const counterInc = (promClient as any)._counterInc

    expect(histogramObserve).toHaveBeenCalledWith(
      expect.objectContaining({
        router: 'patient',
        procedure: 'getById',
        type: 'query',
        status: 'ok',
      }),
      expect.any(Number),
    )

    expect(counterInc).toHaveBeenCalledWith(
      expect.objectContaining({
        router: 'patient',
        procedure: 'getById',
        type: 'query',
        status: 'ok',
      }),
    )
  })

  it('records error count for failed procedure calls', async () => {
    const error = Object.assign(new Error('Not found'), { code: 'NOT_FOUND' })
    const mockNext = vi.fn().mockRejectedValue(error)
    const opts = {
      ctx: {},
      path: 'patient.getById',
      type: 'query' as const,
      rawInput: undefined,
      next: mockNext,
    }

    await expect(metricsMiddleware(opts)).rejects.toThrow('Not found')

    const promClient = await import('prom-client')
    const histogramObserve = (promClient as any)._histogramObserve
    const counterInc = (promClient as any)._counterInc

    // Should still record duration with error status
    expect(histogramObserve).toHaveBeenCalledWith(
      expect.objectContaining({
        router: 'patient',
        procedure: 'getById',
        type: 'query',
        status: 'error',
      }),
      expect.any(Number),
    )

    // Should increment request counter
    expect(counterInc).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
      }),
    )

    // Should increment error counter with error code
    expect(counterInc).toHaveBeenCalledWith(
      expect.objectContaining({
        router: 'patient',
        procedure: 'getById',
        error_code: 'NOT_FOUND',
      }),
    )
  })

  it('adds <5ms overhead (benchmark 1000 calls)', async () => {
    const mockNext = vi.fn().mockResolvedValue({ data: 'ok' })

    const iterations = 1000
    const start = performance.now()

    for (let i = 0; i < iterations; i++) {
      await metricsMiddleware({
        ctx: {},
        path: 'health.check',
        type: 'query' as const,
        rawInput: undefined,
        next: mockNext,
      })
    }

    const elapsed = performance.now() - start
    const overheadPerCall = elapsed / iterations

    // Middleware overhead should be < 5ms per call
    // (This is generous — actual overhead should be well under 1ms)
    expect(overheadPerCall).toBeLessThan(5)
  })

  it('handles path with no dot (single segment) gracefully', async () => {
    const mockNext = vi.fn().mockResolvedValue({ data: 'ok' })
    const opts = {
      ctx: {},
      path: 'health',
      type: 'query' as const,
      rawInput: undefined,
      next: mockNext,
    }

    await metricsMiddleware(opts)

    const promClient = await import('prom-client')
    const histogramObserve = (promClient as any)._histogramObserve

    expect(histogramObserve).toHaveBeenCalledWith(
      expect.objectContaining({
        router: 'health',
        procedure: 'health',
      }),
      expect.any(Number),
    )
  })

  it('returns a metrics registry', () => {
    const registry = getMetricsRegistry()
    expect(registry).toBeDefined()
    expect(registry.metrics).toBeDefined()
  })
})
