/**
 * Network usage metering layer for Data Budget Mode.
 * Estimates payload sizes for outgoing/incoming requests and records usage.
 * Never blocks or fails network requests — metering errors are swallowed.
 */

const OVERHEAD_MULTIPLIER = 1.15 // 15% for HTTP framing/headers/TLS

export type DataUsageCategory = 'upload' | 'audit' | 'notification' | 'other'

export interface RecordUsageFn {
  (entry: {
    date: string
    category: DataUsageCategory
    bytesOut: number
    bytesIn: number
    requestCount: number
  }): Promise<void>
}

/** Estimate outgoing request payload size in bytes. */
export function estimateRequestSize(body: BodyInit | null | undefined): number {
  if (!body) return 0

  let raw = 0
  if (typeof body === 'string') {
    raw = body.length
  } else if (body instanceof Blob) {
    raw = body.size
  } else if (body instanceof ArrayBuffer) {
    raw = body.byteLength
  } else if (body instanceof FormData) {
    // Rough estimate — FormData boundaries add overhead
    let size = 0
    body.forEach((value) => {
      if (typeof value === 'string') {
        size += value.length
      } else {
        size += value.size
      }
    })
    raw = size
  } else {
    // URLSearchParams or ReadableStream — rough guess
    raw = String(body).length
  }

  return Math.round(raw * OVERHEAD_MULTIPLIER)
}

/** Estimate incoming response payload size in bytes. */
export function estimateResponseSize(
  headers: Headers,
  responseBody: string | null,
): number {
  const contentLength = headers.get('Content-Length')
  if (contentLength) {
    const parsed = parseInt(contentLength, 10)
    if (!isNaN(parsed)) return parsed
  }
  if (responseBody) return responseBody.length
  return 0
}

/** Categorize a URL into a data usage category. */
export function categorizeUrl(url: string): DataUsageCategory {
  if (url.includes('audit.sync') || url.includes('audit')) return 'audit'
  if (url.includes('upload') || url.includes('uploadResult')) return 'upload'
  if (url.includes('notification')) return 'notification'
  return 'other'
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Create a metered fetch wrapper.
 * Records estimated request/response sizes to the data budget tables.
 * Never blocks or fails the underlying fetch.
 */
export function createMeterFetch(
  baseFetch: typeof fetch,
  recordUsage: RecordUsageFn,
): typeof fetch {
  return async function meterFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const category = categorizeUrl(url)
    const bytesOut = estimateRequestSize(init?.body)

    const response = await baseFetch(input, init)

    // Record usage asynchronously — never block the response
    try {
      const bytesIn = estimateResponseSize(response.headers, null)
      void recordUsage({
        date: todayISO(),
        category,
        bytesOut,
        bytesIn,
        requestCount: 1,
      }).catch(() => {
        // Swallow — metering must never interfere
      })
    } catch {
      // Swallow
    }

    return response
  }
}
