import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getSupabaseClient } from '@/lib/supabase'
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock'
import { runAuditChainVerify } from '@/jobs/audit-chain-verify'

/**
 * Cron endpoint for daily audit chain integrity verification — Story 23.3 Task 2.
 *
 * Secured via CRON_SECRET header to prevent unauthorized invocations.
 * Schedule: daily at 03:00 UTC (after anomaly detection at 02:00).
 * Configure in vercel.json or equivalent:
 *   { "path": "/api/cron/audit-chain-verify", "schedule": "0 3 * * *" }
 */

const LOCK_TTL = 600 // 10 minutes

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

  // Distributed lock prevents duplicate concurrent runs (AC #1, Story 23.0)
  const token = await acquireCronLock('audit-chain-verify', LOCK_TTL)
  if (!token) {
    return NextResponse.json({
      success: false,
      skipped: true,
      reason: 'Another instance holds the lock',
    }, { status: 409 })
  }

  try {
    const supabase = getSupabaseClient()
    const result = await runAuditChainVerify(supabase)

    return NextResponse.json({
      success: true,
      valid: result.valid,
      checkedCount: result.checkedCount,
      jobDurationMs: result.jobDurationMs,
    })
  } catch (err) {
    console.error('[CRON] Audit chain verification failed:', (err as Error).message)
    return NextResponse.json(
      { error: 'Job execution failed' },
      { status: 500 },
    )
  } finally {
    await releaseCronLock('audit-chain-verify', token)
  }
}
