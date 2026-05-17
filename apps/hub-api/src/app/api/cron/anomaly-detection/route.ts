import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getSupabaseClient } from '@/lib/supabase'
import { runAnomalyDetection } from '@/jobs/anomaly-detection'

/**
 * Cron endpoint for daily prescribing anomaly detection — Story 22.6 Task 2.
 *
 * Secured via CRON_SECRET header to prevent unauthorized invocations.
 * Configure in vercel.json or equivalent:
 *   { "path": "/api/cron/anomaly-detection", "schedule": "0 2 * * *" }
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || !authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const expected = Buffer.from(`Bearer ${cronSecret}`)
  const actual = Buffer.from(authHeader)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseClient()
    const result = await runAnomalyDetection(supabase)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (err) {
    console.error('[CRON] Anomaly detection failed:', (err as Error).message)
    return NextResponse.json(
      { error: 'Job execution failed' },
      { status: 500 },
    )
  }
}
