import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getMetricsRegistry } from '@/trpc/middleware/metrics'

/**
 * Prometheus-compatible metrics scrape endpoint — Story 23.1 Task 2.
 *
 * Secured with METRICS_BEARER_TOKEN. Returns Prometheus text exposition format.
 * Not publicly accessible — intended for infrastructure monitoring only.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const token = process.env.METRICS_BEARER_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: 'Metrics endpoint not configured' },
      { status: 500 },
    )
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const expected = Buffer.from(`Bearer ${token}`)
  const actual = Buffer.from(authHeader)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const registry = getMetricsRegistry()
  let metrics: string
  try {
    metrics = await registry.metrics()
  } catch {
    return NextResponse.json(
      { error: 'Failed to collect metrics' },
      { status: 500 },
    )
  }

  return new NextResponse(metrics, {
    status: 200,
    headers: {
      'content-type': registry.contentType,
      'cache-control': 'no-store',
    },
  })
}
