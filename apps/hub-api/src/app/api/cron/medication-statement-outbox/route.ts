import { NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { drainMedicationStatementOutbox } from '@/lib/medication-statement-outbox'
import { runJobWithRetry } from '@/jobs/job-runner'

/**
 * Cron endpoint for MedicationStatement outbox drain — Story 60.4 (Task 4 / AC 6).
 *
 * Retries post-commit MedicationStatement creations that failed at dispense time
 * (enqueued to medication_statement_outbox). Without this, a transient failure of
 * the best-effort MedicationStatement write left the active-med list silently
 * diverged from the dispense ledger. Idempotent — safe to run frequently.
 *
 * Secured via CRON_SECRET header. Configure in vercel.json with a short schedule
 * (e.g. every 5 minutes): { "path": "/api/cron/medication-statement-outbox" }.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseClient()
    const result = await runJobWithRetry('medication-statement-outbox', () =>
      drainMedicationStatementOutbox(supabase),
    )

    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[CRON] MedicationStatement outbox drain failed:', (err as Error).message)
    return NextResponse.json({ error: 'Job execution failed' }, { status: 500 })
  }
}
