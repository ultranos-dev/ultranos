import type { SupabaseClient } from '@supabase/supabase-js'
import { db } from '@/lib/supabase'
import { emitClinicalSafetyAlert } from '@/lib/alert-notifier'

/**
 * Monthly Clinical Safety Report Generator — Story 23.2 Task 5.
 *
 * Scheduled: 1st of each month at 04:00 UTC.
 * Generates a structured JSON report covering the previous calendar month:
 *   - Drug interaction check completion rate
 *   - Override rate breakdown by severity
 *   - Top 5 most overridden interactions
 *   - Tier 1 sync conflict resolution times
 *   - AI physician edit rate (placeholder for Epic 24)
 *
 * Stored in `clinical_safety_reports` table, exposed via admin endpoint.
 */

interface MonthlyReport {
  month: number
  year: number
  generatedAt: string
  interactionCheckCompletionRate: number
  overrideBreakdown: {
    CONTRAINDICATED: number
    ALLERGY_MATCH: number
    MAJOR: number
    MODERATE: number
    MINOR: number
  }
  topOverriddenInteractions: Array<{
    drugPair: string
    count: number
  }>
  tier1ConflictResolution: {
    averageResolutionHours: number | null
    p95ResolutionHours: number | null
    maxResolutionHours: number | null
    resolvedCount: number
    openCount: number
  }
  aiPhysicianEditRate: string
  aiModelMetrics: {
    updateSuccessRateByModel: Array<{ modelId: string; successRate: number | null }>
    staleDeviceCount: number
    drugDbStalenessIncidents: number
  } | null
}

interface ReportResult {
  reportId: string
  report: MonthlyReport
  startedAt: string
  completedAt: string
  errors: number
}

export async function runClinicalSafetyReport(supabase: SupabaseClient): Promise<ReportResult> {
  const startedAt = new Date().toISOString()
  let errors = 0

  // Determine the previous month's date range
  const now = new Date()
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const month = now.getMonth() === 0 ? 12 : now.getMonth() // 1-indexed
  // Use UTC-based boundaries to avoid timezone offset issues
  const monthStart = new Date(Date.UTC(year, month - 1, 1)).toISOString()
  const monthEnd = new Date(Date.UTC(year, month, 1)).toISOString() // exclusive: first instant of next month

  // ─── Interaction Check Completion Rate ───
  let completionRate = 100
  try {
    const { count: totalRx } = await supabase
      .from('medication_requests')
      .select('id', { count: 'exact', head: true })
      .gte('authored_on', monthStart)
      .lt('authored_on', monthEnd)

    const { count: uncheckedRx } = await supabase
      .from('medication_requests')
      .select('id', { count: 'exact', head: true })
      .gte('authored_on', monthStart)
      .lt('authored_on', monthEnd)
      .eq('interaction_check', 'UNAVAILABLE')

    const total = totalRx ?? 0
    const unchecked = uncheckedRx ?? 0
    completionRate = total > 0 ? ((total - unchecked) / total) * 100 : 100
  } catch (err) {
    errors++
    console.error('[CLINICAL_SAFETY_REPORT] Completion rate calc failed:', (err as Error).message)
  }

  // ─── Override Rate Breakdown ───
  const overrideBreakdown = {
    CONTRAINDICATED: 0,
    ALLERGY_MATCH: 0,
    MAJOR: 0,
    MODERATE: 0,
    MINOR: 0,
  }

  try {
    // CONTRAINDICATED = BLOCKED overrides
    const { count: blockedOverrides } = await supabase
      .from('medication_requests')
      .select('id', { count: 'exact', head: true })
      .gte('authored_on', monthStart)
      .lt('authored_on', monthEnd)
      .eq('interaction_check', 'BLOCKED')
      .not('interaction_override', 'is', null)

    overrideBreakdown.CONTRAINDICATED = blockedOverrides ?? 0

    // WARNING overrides (all non-BLOCKED overrides)
    const { count: warningOverrides } = await supabase
      .from('medication_requests')
      .select('id', { count: 'exact', head: true })
      .gte('authored_on', monthStart)
      .lt('authored_on', monthEnd)
      .eq('interaction_check', 'WARNING')
      .not('interaction_override', 'is', null)

    // Distribute WARNING overrides — in V1, count all as MODERATE since
    // override reason parsing requires full text scan
    overrideBreakdown.MODERATE = warningOverrides ?? 0
  } catch (err) {
    errors++
    console.error('[CLINICAL_SAFETY_REPORT] Override breakdown failed:', (err as Error).message)
  }

  // ─── Top 5 Most Overridden Interactions ───
  let topOverridden: Array<{ drugPair: string; count: number }> = []
  try {
    const { data: overriddenRows } = await supabase
      .from('medication_requests')
      .select('medication_display')
      .gte('authored_on', monthStart)
      .lt('authored_on', monthEnd)
      .not('interaction_override', 'is', null)

    if (overriddenRows) {
      const drugCounts = new Map<string, number>()
      for (const row of overriddenRows) {
        const drug = (row as Record<string, unknown>).medication_display as string
        drugCounts.set(drug, (drugCounts.get(drug) ?? 0) + 1)
      }
      topOverridden = Array.from(drugCounts.entries())
        .map(([drugPair, count]) => ({ drugPair, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
    }
  } catch (err) {
    errors++
    console.error('[CLINICAL_SAFETY_REPORT] Top overridden interactions failed:', (err as Error).message)
  }

  // ─── Tier 1 Conflict Resolution Times ───
  const tier1Stats = {
    averageResolutionHours: null as number | null,
    p95ResolutionHours: null as number | null,
    maxResolutionHours: null as number | null,
    resolvedCount: 0,
    openCount: 0,
  }

  try {
    // Resolved Tier 1 conflicts in the period
    const { data: resolvedConflicts } = await supabase
      .from('sync_conflicts')
      .select('created_at, resolved_at')
      .eq('status', 'RESOLVED')
      .in('resource_type', ['AllergyIntolerance', 'MedicationRequest', 'MedicationStatement', 'Condition'])
      .gte('resolved_at', monthStart)
      .lt('resolved_at', monthEnd)

    if (resolvedConflicts && resolvedConflicts.length > 0) {
      const resolutionTimes = resolvedConflicts.map((c) => {
        const r = c as Record<string, unknown>
        return (new Date(r.resolved_at as string).getTime() - new Date(r.created_at as string).getTime()) / 3_600_000
      }).sort((a, b) => a - b)

      tier1Stats.resolvedCount = resolutionTimes.length
      tier1Stats.averageResolutionHours = Math.round(
        (resolutionTimes.reduce((sum, t) => sum + t, 0) / resolutionTimes.length) * 100,
      ) / 100
      tier1Stats.maxResolutionHours = Math.round(resolutionTimes[resolutionTimes.length - 1] * 100) / 100
      const p95Idx = Math.ceil(resolutionTimes.length * 0.95) - 1
      tier1Stats.p95ResolutionHours = Math.round(resolutionTimes[p95Idx] * 100) / 100
    }

    // Open Tier 1 conflicts
    const { count: openCount } = await supabase
      .from('sync_conflicts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'UNRESOLVED')
      .in('resource_type', ['AllergyIntolerance', 'MedicationRequest', 'MedicationStatement', 'Condition'])

    tier1Stats.openCount = openCount ?? 0
  } catch (err) {
    errors++
    console.error('[CLINICAL_SAFETY_REPORT] Tier 1 stats failed:', (err as Error).message)
  }

  // ─── AI Model Metrics (Story 24.4 Task 7) ───
  let aiModelMetrics: MonthlyReport['aiModelMetrics'] = null
  try {
    const periodStart = new Date(year, month - 1, 1).toISOString()
    const periodEnd = new Date(year, month, 1).toISOString()

    const { data: aiEvents } = await supabase
      .from('ai_model_update_events')
      .select('model_id, event_type, metadata')
      .gte('created_at', periodStart)
      .lt('created_at', periodEnd)

    if (aiEvents && aiEvents.length > 0) {
      const byModel: Record<string, { started: number; completed: number }> = {}
      let staleDeviceCount = 0
      let drugDbStalenessIncidents = 0

      for (const ev of aiEvents) {
        if (!byModel[ev.model_id]) byModel[ev.model_id] = { started: 0, completed: 0 }
        if (ev.event_type === 'MODEL_UPDATE_STARTED') byModel[ev.model_id].started++
        if (ev.event_type === 'MODEL_UPDATE_COMPLETED') byModel[ev.model_id].completed++
        if (ev.event_type === 'MODEL_STALE_DEGRADED') {
          staleDeviceCount++
          if (ev.metadata?.modelType === 'DRUG_DB_OFFLINE') drugDbStalenessIncidents++
        }
      }

      aiModelMetrics = {
        updateSuccessRateByModel: Object.entries(byModel).map(([modelId, counts]) => ({
          modelId,
          successRate: counts.started > 0 ? Math.round((counts.completed / counts.started) * 100) : null,
        })),
        staleDeviceCount,
        drugDbStalenessIncidents,
      }
    }
  } catch (err) {
    errors++
    console.error('[CLINICAL_SAFETY_REPORT] AI model metrics failed:', (err as Error).message)
  }

  // ─── Build Report ───
  const report: MonthlyReport = {
    month,
    year,
    generatedAt: new Date().toISOString(),
    interactionCheckCompletionRate: Math.round(completionRate * 100) / 100,
    overrideBreakdown,
    topOverriddenInteractions: topOverridden,
    tier1ConflictResolution: tier1Stats,
    aiPhysicianEditRate: 'N/A — pending Epic 24 AI scribe metrics',
    aiModelMetrics,
  }

  // Store in database
  const reportId = crypto.randomUUID()
  try {
    await supabase.from('clinical_safety_reports').insert(db.toRowRaw({
      id: reportId,
      month,
      year,
      reportData: report,
      generatedAt: report.generatedAt,
    }, 'non-PHI: clinical_safety_reports'))
  } catch (err) {
    errors++
    console.error('[CLINICAL_SAFETY_REPORT] Failed to store report:', (err as Error).message)
  }

  // Notify Clinical Safety Officer
  try {
    await emitClinicalSafetyAlert(supabase, {
      type: 'MONTHLY_CLINICAL_SAFETY_REPORT',
      severity: 'P3',
      title: `Monthly Clinical Safety Report for ${year}-${String(month).padStart(2, '0')} is ready`,
      payload: {
        reportId,
        month,
        year,
        interactionCheckCompletionRate: report.interactionCheckCompletionRate,
        contraindicatedOverrides: report.overrideBreakdown.CONTRAINDICATED,
      },
    })
  } catch {
    console.warn('[CLINICAL_SAFETY_REPORT] Report notification failed')
  }

  // Record job run
  try {
    await supabase.from('job_runs').insert(db.toRowRaw({
      jobName: 'clinical-safety-report',
      startedAt,
      completedAt: new Date().toISOString(),
      status: errors > 0 ? 'completed_with_errors' : 'success',
      summary: { reportId, month, year, errors },
    }, 'non-PHI: job_runs'))
  } catch {
    console.warn('[CLINICAL_SAFETY_REPORT] Failed to record job run')
  }

  return {
    reportId,
    report,
    startedAt,
    completedAt: new Date().toISOString(),
    errors,
  }
}
