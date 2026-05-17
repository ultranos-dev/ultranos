import type { SupabaseClient } from '@supabase/supabase-js'
import { db } from '@/lib/supabase'
import { emitClinicalSafetyAlert } from '@/lib/alert-notifier'
import {
  contraindicatedOverrideRate,
  interactionCheckCompletionRate,
  unresolvedTier1Conflicts,
  oldestTier1ConflictAgeHours,
} from '@/lib/clinical-safety-metrics'

/**
 * Clinical Safety Monitor Job — Story 23.2 Tasks 2, 3, 4.
 *
 * Runs every 15 minutes to evaluate clinical safety metrics:
 *   1. CONTRAINDICATED override rate (7-day rolling window) → P1 if >2%
 *   2. Tier 1 sync conflict age → P1 if any unresolved >24h
 *   3. Interaction check completion rate (24h window) → P2 if <100%
 *
 * All alerts are audit-logged with SYSTEM actor (AC #8).
 * Auto-resolves alerts when conditions return to normal.
 */

const OVERRIDE_RATE_THRESHOLD = 0.02 // 2%
const OVERRIDE_WINDOW_DAYS = 7
const TIER1_MAX_AGE_HOURS = 24
const COMPLETION_WINDOW_HOURS = 24

// Tier 1 resource types — safety-critical, append-only per CLAUDE.md Rule #5
const TIER1_RESOURCE_TYPES = [
  'AllergyIntolerance',
  'MedicationRequest',
  'MedicationStatement',
  'Condition',
]

interface MonitorResult {
  overrideRateAlert: boolean
  tier1ConflictAlert: boolean
  completionRateAlert: boolean
  metrics: {
    overrideRate: number
    overrideCount: number
    totalChecks: number
    unresolvedTier1Count: number
    oldestConflictAgeHours: number | null
    uncheckedPrescriptions: number
    totalPrescriptions: number
  }
  errors: number
  startedAt: string
  completedAt: string
}

export async function runClinicalSafetyMonitor(supabase: SupabaseClient): Promise<MonitorResult> {
  const startedAt = new Date().toISOString()
  let errors = 0
  let overrideRateAlert = false
  let tier1ConflictAlert = false
  let completionRateAlert = false

  const metrics = {
    overrideRate: 0,
    overrideCount: 0,
    totalChecks: 0,
    unresolvedTier1Count: 0,
    oldestConflictAgeHours: null as number | null,
    uncheckedPrescriptions: 0,
    totalPrescriptions: 0,
  }

  // ─── Check 1: CONTRAINDICATED Override Rate (AC #2, #5) ───
  try {
    const result = await checkContraindicatedOverrideRate(supabase)
    metrics.overrideRate = result.rate
    metrics.overrideCount = result.overrideCount
    metrics.totalChecks = result.totalChecks

    // Update Prometheus gauge
    contraindicatedOverrideRate.set(result.rate * 100)

    if (result.rate > OVERRIDE_RATE_THRESHOLD) {
      overrideRateAlert = true
      await emitClinicalSafetyAlert(supabase, {
        type: 'CONTRAINDICATED_OVERRIDE_RATE',
        severity: 'P1',
        title: `CONTRAINDICATED override rate ${(result.rate * 100).toFixed(1)}% exceeds 2% threshold`,
        payload: {
          overrideCount: result.overrideCount,
          totalChecks: result.totalChecks,
          rate: `${(result.rate * 100).toFixed(2)}%`,
          topProviders: result.topProviders,
          period: `${OVERRIDE_WINDOW_DAYS}-day rolling`,
        },
      })
    } else {
      // Auto-resolve: check if there was a previous active alert
      await autoResolveAlert(supabase, 'CONTRAINDICATED_OVERRIDE_RATE', result.rate)
    }
  } catch (err) {
    errors++
    console.error('[CLINICAL_SAFETY] Override rate check failed:', (err as Error).message)
  }

  // ─── Check 2: Tier 1 Conflict Age (AC #3, #6) ───
  try {
    const result = await checkTier1ConflictAge(supabase)
    metrics.unresolvedTier1Count = result.conflictCount
    metrics.oldestConflictAgeHours = result.oldestAgeHours

    // Update Prometheus gauges
    unresolvedTier1Conflicts.set(result.conflictCount)
    oldestTier1ConflictAgeHours.set(result.oldestAgeHours ?? 0)

    if (result.hasOverageConflicts) {
      tier1ConflictAlert = true
      await emitClinicalSafetyAlert(supabase, {
        type: 'TIER1_CONFLICT_AGE',
        severity: 'P1',
        title: `${result.overageCount} Tier 1 conflict(s) unresolved >24h — patient safety risk`,
        payload: {
          conflictCount: result.overageCount,
          oldestConflictAge: `${Math.round(result.oldestAgeHours ?? 0)} hours`,
          affectedPatientCount: result.affectedPatientCount,
          conflictTypes: result.conflictTypes,
        },
      })
    } else {
      await autoResolveAlert(supabase, 'TIER1_CONFLICT_AGE', 0)
    }
  } catch (err) {
    errors++
    console.error('[CLINICAL_SAFETY] Tier 1 conflict check failed:', (err as Error).message)
  }

  // ─── Check 3: Interaction Check Completion Rate (AC #1) ───
  try {
    const result = await checkInteractionCompletionRate(supabase)
    metrics.uncheckedPrescriptions = result.uncheckedCount
    metrics.totalPrescriptions = result.totalPrescriptions

    // Update Prometheus gauge
    const completionPct = result.totalPrescriptions > 0
      ? ((result.totalPrescriptions - result.uncheckedCount) / result.totalPrescriptions) * 100
      : 100
    interactionCheckCompletionRate.set(completionPct)

    if (result.uncheckedCount > 0) {
      completionRateAlert = true
      await emitClinicalSafetyAlert(supabase, {
        type: 'INTERACTION_CHECK_INCOMPLETE',
        severity: 'P2',
        title: `${result.uncheckedCount} prescription(s) created without completed interaction check`,
        payload: {
          uncheckedCount: result.uncheckedCount,
          totalPrescriptions: result.totalPrescriptions,
          period: `${COMPLETION_WINDOW_HOURS}h`,
          reason: 'interaction_check_unavailable',
        },
      })
    } else {
      await autoResolveAlert(supabase, 'INTERACTION_CHECK_INCOMPLETE', 0)
    }
  } catch (err) {
    errors++
    console.error('[CLINICAL_SAFETY] Completion rate check failed:', (err as Error).message)
  }

  const completedAt = new Date().toISOString()

  // Record job run
  try {
    await supabase.from('job_runs').insert(db.toRowRaw({
      jobName: 'clinical-safety-monitor',
      startedAt,
      completedAt,
      status: errors > 0 ? 'completed_with_errors' : 'success',
      summary: {
        overrideRateAlert,
        tier1ConflictAlert,
        completionRateAlert,
        metrics,
        errors,
      },
    }, 'non-PHI: job_runs'))
  } catch {
    console.warn('[CLINICAL_SAFETY] Failed to record job run')
  }

  return {
    overrideRateAlert,
    tier1ConflictAlert,
    completionRateAlert,
    metrics,
    errors,
    startedAt,
    completedAt,
  }
}

// ─── Check Implementations ───

interface OverrideRateResult {
  rate: number
  overrideCount: number
  totalChecks: number
  topProviders: Array<{ providerId: string; overrideCount: number }>
}

async function checkContraindicatedOverrideRate(supabase: SupabaseClient): Promise<OverrideRateResult> {
  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - OVERRIDE_WINDOW_DAYS)
  const windowStartStr = windowStart.toISOString()

  // Count total prescriptions with interaction checks in the window
  const { count: totalChecks } = await supabase
    .from('medication_requests')
    .select('id', { count: 'exact', head: true })
    .gte('authored_on', windowStartStr)
    .not('interaction_check', 'is', null)

  // Count CONTRAINDICATED overrides (BLOCKED check with an override provided)
  const { count: overrideCount } = await supabase
    .from('medication_requests')
    .select('id', { count: 'exact', head: true })
    .gte('authored_on', windowStartStr)
    .eq('interaction_check', 'BLOCKED')
    .not('interaction_override', 'is', null)

  const total = totalChecks ?? 0
  const overrides = overrideCount ?? 0
  const rate = total > 0 ? overrides / total : 0

  // Top providers by override count (no patient data — AC #2)
  let topProviders: Array<{ providerId: string; overrideCount: number }> = []
  if (overrides > 0) {
    // Cap fetch to 1000 rows — we only need top 5 providers
    const { data: providerRows } = await supabase
      .from('medication_requests')
      .select('requester_id')
      .gte('authored_on', windowStartStr)
      .eq('interaction_check', 'BLOCKED')
      .not('interaction_override', 'is', null)
      .limit(1000)

    // Aggregate by provider
    const providerCounts = new Map<string, number>()
    for (const row of (providerRows ?? [])) {
      const id = (row as Record<string, unknown>).requester_id as string
      providerCounts.set(id, (providerCounts.get(id) ?? 0) + 1)
    }

    topProviders = Array.from(providerCounts.entries())
      .map(([providerId, count]) => ({ providerId, overrideCount: count }))
      .sort((a, b) => b.overrideCount - a.overrideCount)
      .slice(0, 5)
  }

  return { rate, overrideCount: overrides, totalChecks: total, topProviders }
}

interface Tier1ConflictResult {
  conflictCount: number
  overageCount: number
  oldestAgeHours: number | null
  hasOverageConflicts: boolean
  affectedPatientCount: number
  conflictTypes: string[]
}

async function checkTier1ConflictAge(supabase: SupabaseClient): Promise<Tier1ConflictResult> {
  // Query unresolved sync conflicts for Tier 1 resource types
  // Cap at 5000 to prevent OOM after prolonged outages
  const { data: conflicts } = await supabase
    .from('sync_conflicts')
    .select('id, resource_type, patient_ref, created_at')
    .eq('status', 'UNRESOLVED')
    .in('resource_type', TIER1_RESOURCE_TYPES)
    .order('created_at', { ascending: true })
    .limit(5000)

  if (!conflicts || conflicts.length === 0) {
    return {
      conflictCount: 0,
      overageCount: 0,
      oldestAgeHours: null,
      hasOverageConflicts: false,
      affectedPatientCount: 0,
      conflictTypes: [],
    }
  }

  const now = Date.now()
  const thresholdMs = TIER1_MAX_AGE_HOURS * 3600 * 1000
  let oldestAgeMs = 0
  let overageCount = 0
  const affectedPatients = new Set<string>()
  const conflictTypes = new Set<string>()

  for (const conflict of conflicts) {
    const c = conflict as Record<string, unknown>
    const createdAt = new Date(c.created_at as string).getTime()
    const ageMs = now - createdAt

    if (ageMs > oldestAgeMs) oldestAgeMs = ageMs

    if (ageMs > thresholdMs) {
      overageCount++
      if (c.patient_ref) affectedPatients.add(c.patient_ref as string)
      conflictTypes.add(c.resource_type as string)
    }
  }

  return {
    conflictCount: conflicts.length,
    overageCount,
    oldestAgeHours: oldestAgeMs > 0 ? oldestAgeMs / 3_600_000 : null,
    hasOverageConflicts: overageCount > 0,
    affectedPatientCount: affectedPatients.size,
    conflictTypes: Array.from(conflictTypes),
  }
}

interface CompletionRateResult {
  uncheckedCount: number
  totalPrescriptions: number
}

async function checkInteractionCompletionRate(supabase: SupabaseClient): Promise<CompletionRateResult> {
  const windowStart = new Date()
  windowStart.setHours(windowStart.getHours() - COMPLETION_WINDOW_HOURS)
  const windowStartStr = windowStart.toISOString()

  // Total prescriptions in the last 24 hours
  const { count: totalPrescriptions } = await supabase
    .from('medication_requests')
    .select('id', { count: 'exact', head: true })
    .gte('authored_on', windowStartStr)

  // Prescriptions with interaction_check = UNAVAILABLE
  const { count: uncheckedCount } = await supabase
    .from('medication_requests')
    .select('id', { count: 'exact', head: true })
    .gte('authored_on', windowStartStr)
    .eq('interaction_check', 'UNAVAILABLE')

  return {
    uncheckedCount: uncheckedCount ?? 0,
    totalPrescriptions: totalPrescriptions ?? 0,
  }
}

/**
 * Auto-resolve: notify when a previously-alerting condition returns to normal.
 */
async function autoResolveAlert(
  supabase: SupabaseClient,
  alertType: string,
  currentRate: number,
): Promise<void> {
  // Check if there was a recent alert of this type
  const { data: recentAlert } = await supabase
    .from('job_runs')
    .select('summary')
    .eq('job_name', 'clinical-safety-monitor')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!recentAlert) return

  const summary = (recentAlert as Record<string, unknown>).summary as Record<string, unknown> | null
  if (!summary) return

  const alertFlagMap: Record<string, string> = {
    CONTRAINDICATED_OVERRIDE_RATE: 'overrideRateAlert',
    TIER1_CONFLICT_AGE: 'tier1ConflictAlert',
    INTERACTION_CHECK_INCOMPLETE: 'completionRateAlert',
  }
  const flagKey = alertFlagMap[alertType]
  const wasAlerting = flagKey ? summary[flagKey] === true : false

  if (wasAlerting) {
    await emitClinicalSafetyAlert(supabase, {
      type: `${alertType}_RESOLVED`,
      severity: 'P3',
      title: `${alertType} returned to normal: ${(currentRate * 100).toFixed(2)}%`,
      payload: {
        currentRate: `${(currentRate * 100).toFixed(2)}%`,
        threshold: `${OVERRIDE_RATE_THRESHOLD * 100}%`,
      },
    })
  }
}
