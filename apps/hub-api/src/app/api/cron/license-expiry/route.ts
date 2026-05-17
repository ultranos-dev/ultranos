import { NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { runLicenseExpiryCheck } from '@/jobs/license-expiry-check'

/**
 * Cron endpoint for daily license expiry check — Story 22.4 Task 6.
 *
 * Secured via CRON_SECRET header to prevent unauthorized invocations.
 * Configure in vercel.json or equivalent:
 *   { "path": "/api/cron/license-expiry", "schedule": "0 0 * * *" }
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseClient()
    const result = await runLicenseExpiryCheck(supabase)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (err) {
    console.error('[CRON] License expiry check failed:', (err as Error).message)
    return NextResponse.json(
      { error: 'Job execution failed' },
      { status: 500 },
    )
  }
}
