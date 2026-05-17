import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the metrics registry
vi.mock('../trpc/middleware/metrics', () => ({
  getMetricsRegistry: vi.fn().mockReturnValue({
    metrics: vi.fn().mockResolvedValue(
      '# HELP trpc_request_duration_ms Duration of tRPC procedure calls\n' +
        '# TYPE trpc_request_duration_ms histogram\n' +
        'trpc_request_total{router="patient",procedure="getById",type="query",status="ok"} 42\n',
    ),
    contentType: 'text/plain; version=0.0.4; charset=utf-8',
  }),
}))

import { GET } from '../app/api/metrics/route'

describe('/api/metrics endpoint', () => {
  const VALID_TOKEN = 'test-metrics-token-123'

  beforeEach(() => {
    vi.stubEnv('METRICS_BEARER_TOKEN', VALID_TOKEN)
  })

  it('returns Prometheus text format with valid auth token', async () => {
    const req = new Request('http://localhost:3000/api/metrics', {
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })

    const res = await GET(req)
    expect(res.status).toBe(200)

    const body = await res.text()
    expect(body).toContain('trpc_request_total')
    expect(body).toContain('trpc_request_duration_ms')

    const contentType = res.headers.get('content-type')
    expect(contentType).toContain('text/plain')
  })

  it('rejects unauthenticated requests with 401', async () => {
    const req = new Request('http://localhost:3000/api/metrics')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('rejects requests with wrong token', async () => {
    const req = new Request('http://localhost:3000/api/metrics', {
      headers: { authorization: 'Bearer wrong-token' },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 500 if METRICS_BEARER_TOKEN is not configured', async () => {
    vi.stubEnv('METRICS_BEARER_TOKEN', '')

    const req = new Request('http://localhost:3000/api/metrics', {
      headers: { authorization: 'Bearer anything' },
    })
    const res = await GET(req)
    expect(res.status).toBe(500)
  })
})
