import { NextResponse } from 'next/server'
import { getRedisInfo } from '@/lib/redis'

/**
 * Standalone Redis health probe — Story 23.0 Task 2.
 *
 * No authentication required. Intended for infrastructure monitoring
 * tools to poll Redis connectivity independently of the tRPC health check.
 *
 * Returns: { status: 'connected' | 'disconnected' | 'not_configured', latencyMs: number | null }
 */
export async function GET(): Promise<NextResponse> {
  if (!process.env.REDIS_URL) {
    return NextResponse.json({
      status: 'not_configured' as const,
      latencyMs: null,
    })
  }

  const info = await getRedisInfo()
  const status = info.connected ? 'connected' : 'disconnected'

  return NextResponse.json(
    { status, latencyMs: info.latencyMs },
    { status: info.connected ? 200 : 503 },
  )
}
