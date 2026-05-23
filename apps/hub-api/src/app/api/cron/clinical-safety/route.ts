import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getSupabaseClient } from '@/lib/supabase'
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock'
import { runClinicalSafetyMonitor } from '@/jobs/clinical-safety-monitor'
import { runClinicalSafetyReport } from '@/jobs/clinical-safety-report'

/**
 * Cron endpoint for clinical safety monitoring — Story 23.2 Task 7.
 *
 * Runs every 15 minutes for near-real-time clinical safety monitoring.
 * On the 1st of each month, also generates the monthly report.
 *
 * Secured via CRON_SECRET header to prevent unauthorized invocations.
 * Configure in vercel.json with path "/api/cron/clinical-safety"
 * and a 15-minute cron schedule.
 */

const MONITOR_LOCK_TTL = 300 // 5 minutes
const REPORT_LOCK_TTL = 600 // 10 minutes

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

  const supabase = getSupabaseClient()
  const results: Record<string, unknown> = {}

  // Phase 1: Clinical safety monitor (every 15 minutes)
  const monitorToken = await acquireCronLock('clinical-safety-monitor', MONITOR_LOCK_TTL)
  if (!monitorToken) {
    results.monitor = { skipped: true, reason: 'lock_held' }
  } else {
    try {
      const monitorResult = await runClinicalSafetyMonitor(supabase)
      results.monitor = { success: true, ...monitorResult }
    } catch (err) {
      console.error('[CRON] Clinical safety monitor failed:', (err as Error).message)
      results.monitor = { success: false, error: 'Job execution failed' }
    } finally {
      await releaseCronLock('clinical-safety-monitor', monitorToken)
    }
  }

  // Phase 2: Monthly report (1st of month — idempotent, runs all day)
  const today = new Date()
  if (today.getUTCDate() === 1) {
    // Idempotency: check if this month's report already exists
    const prevMonth = today.getUTCMonth() === 0 ? 12 : today.getUTCMonth()
    const prevYear = today.getUTCMonth() === 0 ? today.getUTCFullYear() - 1 : today.getUTCFullYear()
    const { data: existingReport } = await supabase
      .from('clinical_safety_reports')
      .select('id')
      .eq('month', prevMonth)
      .eq('year', prevYear)
      .limit(1)
      .maybeSingle()

    if (existingReport) {
      results.report = { skipped: true, reason: 'already_generated' }
    } else {
      const reportToken = await acquireCronLock('clinical-safety-report', REPORT_LOCK_TTL)
      if (!reportToken) {
        results.report = { skipped: true, reason: 'lock_held' }
      } else {
        try {
          const reportResult = await runClinicalSafetyReport(supabase)
          results.report = { success: true, reportId: reportResult.reportId }
        } catch (err) {
          console.error('[CRON] Clinical safety report failed:', (err as Error).message)
          results.report = { success: false, error: 'Report generation failed' }
        } finally {
          await releaseCronLock('clinical-safety-report', reportToken)
        }
      }
    }
  }

  return NextResponse.json({ success: true, ...results })
}
