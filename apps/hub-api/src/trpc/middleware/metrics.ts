import { Histogram, Counter, Registry, collectDefaultMetrics } from 'prom-client'

/**
 * Dedicated metrics registry — Story 23.1 Task 1.
 *
 * Uses a custom registry to avoid polluting the global default and to give
 * the /api/metrics endpoint explicit control over what gets scraped.
 */
const registry = new Registry()

// Register default Node.js metrics (heap, GC, event loop lag)
collectDefaultMetrics({ register: registry })

/**
 * Histogram: trpc_request_duration_ms
 * Tracks per-procedure latency distribution for P50/P95/P99 calculation.
 * Bucket boundaries optimised for clinical API response-time SLOs.
 */
const requestDuration = new Histogram({
  name: 'trpc_request_duration_ms',
  help: 'Duration of tRPC procedure calls in milliseconds',
  labelNames: ['router', 'procedure', 'type', 'status'] as const,
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [registry],
})

/**
 * Counter: trpc_request_total
 * Total request count per procedure for throughput monitoring.
 */
const requestTotal = new Counter({
  name: 'trpc_request_total',
  help: 'Total number of tRPC procedure calls',
  labelNames: ['router', 'procedure', 'type', 'status'] as const,
  registers: [registry],
})

/**
 * Counter: trpc_request_errors_total
 * Error counter broken down by error code for alert evaluation.
 */
const requestErrors = new Counter({
  name: 'trpc_request_errors_total',
  help: 'Total number of tRPC procedure errors',
  labelNames: ['router', 'procedure', 'error_code'] as const,
  registers: [registry],
})

/** Parse tRPC path into router + procedure labels. */
function parsePathLabels(path: string): { router: string; procedure: string } {
  const dotIndex = path.indexOf('.')
  if (dotIndex === -1) {
    return { router: path, procedure: path }
  }
  return { router: path.slice(0, dotIndex), procedure: path.slice(dotIndex + 1) }
}

/**
 * tRPC metrics middleware — outermost layer.
 *
 * Records request duration, total count, and error count for every procedure.
 * In-memory only: no I/O per request. Adds <1ms overhead.
 */
export async function metricsMiddleware(opts: {
  ctx: unknown
  path: string
  type: string
  rawInput: unknown
  next: (opts?: { ctx: unknown }) => Promise<unknown>
}): Promise<unknown> {
  const start = performance.now()
  const { router, procedure } = parsePathLabels(opts.path)
  const type = opts.type

  try {
    const result = await opts.next()
    const durationMs = performance.now() - start

    requestDuration.observe({ router, procedure, type, status: 'ok' }, durationMs)
    requestTotal.inc({ router, procedure, type, status: 'ok' })

    return result
  } catch (err: unknown) {
    const durationMs = performance.now() - start

    requestDuration.observe({ router, procedure, type, status: 'error' }, durationMs)
    requestTotal.inc({ router, procedure, type, status: 'error' })

    const errorCode = (err as { code?: string })?.code ?? 'UNKNOWN'
    requestErrors.inc({ router, procedure, error_code: errorCode })

    throw err
  }
}

/** Expose the registry for the /api/metrics endpoint and alerting evaluation. */
export function getMetricsRegistry(): Registry {
  return registry
}

/** Expose individual metrics for alerting evaluation (Task 4/5). */
export function getRequestDurationHistogram(): Histogram {
  return requestDuration
}

export function getRequestTotalCounter(): Counter {
  return requestTotal
}

export function getRequestErrorsCounter(): Counter {
  return requestErrors
}
