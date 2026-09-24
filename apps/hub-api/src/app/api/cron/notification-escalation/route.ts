import { NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { checkEscalations } from '@/services/notification-escalation'
import { runJobWithRetry } from '@/jobs/job-runner'

/**
 * Cron endpoint for notification escalation — Story 12.4 (wired by Story 60.4).
 *
 * The escalation SERVICE (checkEscalations) existed and was unit-tested, but the
 * audit found NO in-tree cron actually triggered it: unacknowledged critical lab
 * results were never re-sent (24h) or escalated to back-office (48h). This wires
 * the missing trigger, using the same timing-safe CRON_SECRET pattern as the
 * other cron routes.
 *
 * Configure in vercel.json (hourly is sufficient for a 24h/48h policy):
 *   { "path": "/api/cron/notification-escalation", "schedule": "0 * * * *" }
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseClient()
    const result = await runJobWithRetry('notification-escalation', () => checkEscalations(supabase))

    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[CRON] Notification escalation failed:', (err as Error).message)
    return NextResponse.json({ error: 'Job execution failed' }, { status: 500 })
  }
}
