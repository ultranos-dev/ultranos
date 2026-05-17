import type { SupabaseClient } from '@supabase/supabase-js'
import { db } from '@/lib/supabase'

/**
 * Daily prescribing anomaly detection job — Story 22.6 Task 2.
 *
 * Analyzes prescribing patterns over the last 7 days and generates alerts:
 *   Rule 1 (CONTROLLED_SUBSTANCE_VOLUME): >10 controlled substance Rxs from one
 *           provider in a single day → severity HIGH
 *   Rule 2 (DRUG_FREQUENCY): same drug prescribed to >20% of a provider's
 *           patients in a 7-day window → severity MEDIUM
 *
 * Alerts are deduplicated by (practitioner_id, anomaly_type, date_range_start,
 * date_range_end) via a DB unique constraint — duplicate inserts are skipped.
 *
 * Runs at 02:00 UTC daily (staggered after license-expiry at 00:00).
 * Idempotent: safe to re-run.
 */

const CONTROLLED_SUBSTANCE_THRESHOLD = 10
const DRUG_FREQUENCY_THRESHOLD_PERCENT = 20
const DRUG_FREQUENCY_MIN_PATIENTS = 5
const ANALYSIS_WINDOW_DAYS = 7

interface JobResult {
  alertsGenerated: number
  errors: number
  startedAt: string
  completedAt: string
}

export async function runAnomalyDetection(supabase: SupabaseClient): Promise<JobResult> {
  const startedAt = new Date().toISOString()
  let alertsGenerated = 0
  let errors = 0

  const today = new Date()
  const windowStart = new Date(today)
  windowStart.setDate(windowStart.getDate() - ANALYSIS_WINDOW_DAYS)
  const windowStartStr = windowStart.toISOString().split('T')[0]
  const windowEndStr = today.toISOString().split('T')[0]

  // ─── Rule 1: Controlled Substance Volume ───
  try {
    const count = await detectControlledSubstanceVolume(
      supabase, windowStartStr, windowEndStr,
    )
    alertsGenerated += count
  } catch (err) {
    errors++
    console.error('[ANOMALY_DETECTION] Controlled substance check failed:', (err as Error).message)
  }

  // ─── Rule 2: Drug Frequency ───
  try {
    const count = await detectDrugFrequency(
      supabase, windowStartStr, windowEndStr,
    )
    alertsGenerated += count
  } catch (err) {
    errors++
    console.error('[ANOMALY_DETECTION] Drug frequency check failed:', (err as Error).message)
  }

  const completedAt = new Date().toISOString()

  // Record job run — no PHI in summary
  try {
    await supabase.from('job_runs').insert(db.toRowRaw({
      jobName: 'anomaly-detection',
      startedAt,
      completedAt,
      status: errors > 0 ? 'completed_with_errors' : 'success',
      summary: { alertsGenerated, errors },
    }, 'non-PHI: job_runs'))
  } catch {
    console.warn('[ANOMALY_DETECTION] Failed to record job run')
  }

  // Log summary only — no provider names or PHI
  console.info('[ANOMALY_DETECTION] Complete', { alertsGenerated, errors })

  return { alertsGenerated, errors, startedAt, completedAt }
}

/**
 * Rule 1: Flag providers who prescribed >10 controlled substances in a single day.
 * Uses a raw SQL query via RPC since this requires GROUP BY + HAVING + JOIN.
 */
async function detectControlledSubstanceVolume(
  supabase: SupabaseClient,
  windowStart: string,
  windowEnd: string,
): Promise<number> {
  // Query: group prescriptions of controlled substances by provider + day,
  // find any day with count > threshold
  const { data: violations, error } = await supabase.rpc(
    'detect_controlled_substance_anomalies',
    {
      window_start: windowStart,
      window_end: windowEnd,
      threshold: CONTROLLED_SUBSTANCE_THRESHOLD,
    },
  )

  if (error) {
    console.warn('[ANOMALY_DETECTION] RPC detect_controlled_substance_anomalies failed, using fallback:', error.message)
    return await detectControlledSubstanceVolumeFallback(
      supabase, windowStart, windowEnd,
    )
  }

  let generated = 0
  for (const v of (violations ?? [])) {
    try {
      const { error: insertError } = await supabase
        .from('prescribing_anomalies')
        .upsert(db.toRowRaw({
          practitionerId: v.requester_id,
          practitionerName: v.practitioner_name,
          anomalyType: 'CONTROLLED_SUBSTANCE_VOLUME',
          threshold: CONTROLLED_SUBSTANCE_THRESHOLD,
          actualValue: v.daily_count,
          dateRangeStart: v.prescription_day,
          dateRangeEnd: v.prescription_day,
          severity: 'HIGH',
          status: 'UNREVIEWED',
        }, 'non-PHI: prescribing_anomalies'), {
          onConflict: 'practitioner_id,anomaly_type,date_range_start,date_range_end',
          ignoreDuplicates: true,
        })

      if (!insertError) generated++
    } catch {
      // Skip — dedup constraint will handle true duplicates
    }
  }

  return generated
}

/**
 * Fallback for Rule 1 when the RPC function doesn't exist.
 * Fetches controlled substance codes, then queries medication_requests.
 */
async function detectControlledSubstanceVolumeFallback(
  supabase: SupabaseClient,
  windowStart: string,
  windowEnd: string,
): Promise<number> {
  // Get controlled substance codes
  const { data: controlledDrugs } = await supabase
    .from('vocabulary_medications')
    .select('code')
    .eq('is_controlled_substance', true)

  if (!controlledDrugs || controlledDrugs.length === 0) return 0

  const controlledCodes = new Set(controlledDrugs.map((d: { code: string }) => d.code))

  // Fetch all prescriptions in the window with their providers
  const providerDayCounts = new Map<string, Map<string, { count: number; name: string }>>()
  let offset = 0
  const BATCH = 500

  while (true) {
    const { data: rows, error } = await supabase
      .from('medication_requests')
      .select('requester_id, medication_codeable_concept, authored_on, practitioners!requester_id(given_name, family_name)')
      .gte('authored_on', windowStart)
      .lte('authored_on', windowEnd)
      .in('prescription_status', ['ACTIVE', 'DISPENSED', 'PARTIALLY_DISPENSED'])
      .range(offset, offset + BATCH - 1)

    if (error || !rows || rows.length === 0) break

    for (const row of rows) {
      const r = row as Record<string, unknown>
      const code = r.medication_codeable_concept as string
      if (!controlledCodes.has(code)) continue

      const providerId = r.requester_id as string
      const day = (r.authored_on as string).split('T')[0]
      const prac = r.practitioners as { given_name?: string; family_name?: string } | null
      const name = prac ? `${prac.given_name ?? ''} ${prac.family_name ?? ''}`.trim() : 'Unknown'

      if (!providerDayCounts.has(providerId)) {
        providerDayCounts.set(providerId, new Map())
      }
      const days = providerDayCounts.get(providerId)!
      const existing = days.get(day)
      if (existing) {
        existing.count++
      } else {
        days.set(day, { count: 1, name })
      }
    }

    if (rows.length < BATCH) break
    offset += BATCH
  }

  // Generate alerts for violations
  let generated = 0
  for (const [providerId, days] of providerDayCounts) {
    for (const [day, { count, name }] of days) {
      if (count <= CONTROLLED_SUBSTANCE_THRESHOLD) continue

      try {
        const { error: insertError } = await supabase
          .from('prescribing_anomalies')
          .upsert(db.toRowRaw({
            practitionerId: providerId,
            practitionerName: name,
            anomalyType: 'CONTROLLED_SUBSTANCE_VOLUME',
            threshold: CONTROLLED_SUBSTANCE_THRESHOLD,
            actualValue: count,
            dateRangeStart: day,
            dateRangeEnd: day,
            severity: 'HIGH',
            status: 'UNREVIEWED',
          }, 'non-PHI: prescribing_anomalies'), {
            onConflict: 'practitioner_id,anomaly_type,date_range_start,date_range_end',
            ignoreDuplicates: true,
          })

        if (!insertError) generated++
      } catch {
        // Dedup constraint handles duplicates
      }
    }
  }

  return generated
}

/**
 * Rule 2: Flag providers who prescribed the same drug to >20% of their patients
 * in the 7-day analysis window.
 */
async function detectDrugFrequency(
  supabase: SupabaseClient,
  windowStart: string,
  windowEnd: string,
): Promise<number> {
  // Build per-provider stats: total unique patients + per-drug unique patients
  const providerStats = new Map<string, {
    name: string
    totalPatients: Set<string>
    drugPatients: Map<string, { patients: Set<string>; display: string }>
  }>()

  let offset = 0
  const BATCH = 500

  while (true) {
    const { data: rows, error } = await supabase
      .from('medication_requests')
      .select('requester_id, subject_reference, medication_codeable_concept, medication_display, practitioners!requester_id(given_name, family_name)')
      .gte('authored_on', windowStart)
      .lte('authored_on', windowEnd)
      .in('prescription_status', ['ACTIVE', 'DISPENSED', 'PARTIALLY_DISPENSED'])
      .range(offset, offset + BATCH - 1)

    if (error || !rows || rows.length === 0) break

    for (const row of rows) {
      const r = row as Record<string, unknown>
      const providerId = r.requester_id as string
      const patientRef = r.subject_reference as string
      const drugCode = r.medication_codeable_concept as string
      const drugDisplay = r.medication_display as string
      const prac = r.practitioners as { given_name?: string; family_name?: string } | null
      const name = prac ? `${prac.given_name ?? ''} ${prac.family_name ?? ''}`.trim() : 'Unknown'

      if (!providerStats.has(providerId)) {
        providerStats.set(providerId, {
          name,
          totalPatients: new Set(),
          drugPatients: new Map(),
        })
      }

      const stats = providerStats.get(providerId)!
      stats.totalPatients.add(patientRef)

      if (!stats.drugPatients.has(drugCode)) {
        stats.drugPatients.set(drugCode, { patients: new Set(), display: drugDisplay })
      }
      stats.drugPatients.get(drugCode)!.patients.add(patientRef)
    }

    if (rows.length < BATCH) break
    offset += BATCH
  }

  // Evaluate thresholds
  let generated = 0
  for (const [providerId, stats] of providerStats) {
    const totalPatients = stats.totalPatients.size
    if (totalPatients < DRUG_FREQUENCY_MIN_PATIENTS) continue

    for (const [drugCode, drugInfo] of stats.drugPatients) {
      const percent = (drugInfo.patients.size / totalPatients) * 100
      if (percent <= DRUG_FREQUENCY_THRESHOLD_PERCENT) continue

      try {
        const { error: insertError } = await supabase
          .from('prescribing_anomalies')
          .upsert(db.toRowRaw({
            practitionerId: providerId,
            practitionerName: stats.name,
            anomalyType: 'DRUG_FREQUENCY',
            threshold: DRUG_FREQUENCY_THRESHOLD_PERCENT,
            actualValue: Math.round(percent * 100) / 100,
            dateRangeStart: windowStart,
            dateRangeEnd: windowEnd,
            severity: 'MEDIUM',
            status: 'UNREVIEWED',
            triggerIdentifier: drugCode,
          }, 'non-PHI: prescribing_anomalies'), {
            onConflict: 'practitioner_id,anomaly_type,date_range_start,date_range_end,trigger_identifier',
            ignoreDuplicates: true,
          })

        if (!insertError) generated++
      } catch {
        // Dedup constraint handles duplicates
      }
    }
  }

  return generated
}
