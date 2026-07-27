/**
 * Story 54.6 — Actionable Deadline Calculator
 *
 * Generates a prioritized list of deadlines from a SeasonalPlan.
 * Each deadline accounts for the relevant lead time so the lab manager
 * knows exactly when to act, not just when the event occurs.
 *
 * Lead times are configurable per lab (supplier delivery, HR processing, etc.)
 * and default to conservative values appropriate for rural Afghan lab contexts.
 *
 * NO PHI — all deadlines relate to reagents, staffing, power, and protocols.
 * No patient identifiers appear in this module.
 */

import type {
  SeasonalPlan,
  ActionableDeadline,
  LabForecastConfig,
  DeadlineCategory,
  DeadlineUrgency,
} from '@/types/seasonal-planner'

const DEFAULT_CONFIG_DEADLINES: Pick<
  LabForecastConfig,
  | 'supplierLeadTimeDays'
  | 'reagentSafetyBufferDays'
  | 'hrLeadTimeDays'
  | 'fuelLeadTimeDays'
> = {
  supplierLeadTimeDays: 14,
  reagentSafetyBufferDays: 7,
  hrLeadTimeDays: 14,
  fuelLeadTimeDays: 7,
}

function isoDateFromOffset(baseDate: Date, offsetDays: number): string {
  const d = new Date(baseDate)
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

function isOverdue(deadlineDate: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(deadlineDate) < today
}

function classifyUrgency(deadlineDate: string): DeadlineUrgency {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dl = new Date(deadlineDate)
  const daysUntil = Math.ceil((dl.getTime() - today.getTime()) / 86_400_000)
  if (daysUntil < 0) return 'critical'   // overdue → always critical
  if (daysUntil <= 7) return 'critical'
  if (daysUntil <= 14) return 'important'
  return 'routine'
}

function makeDeadline(
  action: string,
  deadlineDate: string,
  leadTimeDays: number,
  category: DeadlineCategory,
  notes?: string,
): ActionableDeadline {
  const overdue = isOverdue(deadlineDate)
  const urgency = classifyUrgency(deadlineDate)
  return {
    id: crypto.randomUUID(),
    action,
    deadlineDate,
    leadTimeDays,
    urgency: overdue ? 'critical' : urgency,
    category,
    notes,
    isOverdue: overdue,
  }
}

/**
 * Generate all actionable deadlines from a SeasonalPlan.
 *
 * Deadline logic per category:
 *   - Reagent: reorderDeadline already computed in reagent forecast (supplier lead + safety buffer)
 *   - Staffing: surge start − HR lead time
 *   - Power: surge start − fuel procurement lead time
 *   - Protocol: surge start − 7 days (staff review buffer)
 *
 * Results are sorted: overdue first, then by deadline date ascending.
 */
export function calculateDeadlines(
  plan: SeasonalPlan,
  configOverrides?: Partial<
    Pick<LabForecastConfig, 'supplierLeadTimeDays' | 'reagentSafetyBufferDays' | 'hrLeadTimeDays' | 'fuelLeadTimeDays'>
  >,
): ActionableDeadline[] {
  const cfg = { ...DEFAULT_CONFIG_DEADLINES, ...configOverrides }
  const deadlines: ActionableDeadline[] = []

  // --- Reagent deadlines ---
  for (const item of plan.reagentForecast.items) {
    if (!item.reorderDeadline) continue
    const totalLeadTime = cfg.supplierLeadTimeDays + cfg.reagentSafetyBufferDays

    const costNote = item.estimatedCost
      ? ` (estimated cost: ${item.estimatedCost.toFixed(0)} AFN)`
      : ''
    deadlines.push(
      makeDeadline(
        `Order ${item.reagentName} — projected depletion ${item.projectedDepletionDate ?? 'within plan period'}`,
        item.reorderDeadline,
        totalLeadTime,
        'reagent',
        `Current stock: ${item.currentStock} units. Projected consumption: ${item.projectedConsumption} units over 30 days.${costNote}`,
      ),
    )
  }

  // --- Staffing deadline ---
  const { staffingForecast } = plan
  if (staffingForecast.recommendedStaffCount > staffingForecast.currentStaffCount) {
    const staffGap = staffingForecast.recommendedStaffCount - staffingForecast.currentStaffCount

    // Deadline = surge start − HR lead time, or today + HR lead time if surge already started
    const surgeAlerts = plan._ultranos.surgeAlerts
    const nearestSurge = surgeAlerts[0]

    let staffDeadline: string
    if (nearestSurge?.surgeStartDate) {
      const surgeStart = new Date(nearestSurge.surgeStartDate)
      surgeStart.setDate(surgeStart.getDate() - cfg.hrLeadTimeDays)
      staffDeadline = surgeStart.toISOString().slice(0, 10)
    } else {
      staffDeadline = isoDateFromOffset(new Date(), cfg.hrLeadTimeDays)
    }

    deadlines.push(
      makeDeadline(
        `Request ${staffGap} additional staff member(s) for peak season`,
        staffDeadline,
        cfg.hrLeadTimeDays,
        'staffing',
        `Current staff: ${staffingForecast.currentStaffCount}. Projected daily tests: ${staffingForecast.projectedDailyTests}. Recommended: ${staffingForecast.recommendedStaffCount}.`,
      ),
    )
  }

  // --- Power / fuel deadline ---
  const { powerForecast } = plan
  if (powerForecast.generatorFuelNeeded > 0) {
    const surgeAlerts = plan._ultranos.surgeAlerts
    const nearestSurge = surgeAlerts[0]
    let fuelDeadline: string
    if (nearestSurge?.surgeStartDate) {
      const surgeStart = new Date(nearestSurge.surgeStartDate)
      surgeStart.setDate(surgeStart.getDate() - cfg.fuelLeadTimeDays)
      fuelDeadline = surgeStart.toISOString().slice(0, 10)
    } else {
      fuelDeadline = isoDateFromOffset(new Date(), cfg.fuelLeadTimeDays)
    }

    deadlines.push(
      makeDeadline(
        `Procure ${powerForecast.generatorFuelNeeded}L of generator fuel for peak season`,
        fuelDeadline,
        cfg.fuelLeadTimeDays,
        'power',
        `Projected analyzer-hours: ${powerForecast.estimatedAnalyzerHours}h. At ${0.5}L/h, ${powerForecast.generatorFuelNeeded}L diesel required.`,
      ),
    )
  }

  // --- Protocol / staff review deadline ---
  {
    const surgeAlerts = plan._ultranos.surgeAlerts
    const nearestSurge = surgeAlerts[0]
    const PROTOCOL_REVIEW_LEAD = 7  // days before surge to review protocols

    let protocolDeadline: string
    if (nearestSurge?.surgeStartDate) {
      const surgeStart = new Date(nearestSurge.surgeStartDate)
      surgeStart.setDate(surgeStart.getDate() - PROTOCOL_REVIEW_LEAD)
      protocolDeadline = surgeStart.toISOString().slice(0, 10)
    } else {
      protocolDeadline = isoDateFromOffset(new Date(), PROTOCOL_REVIEW_LEAD)
    }

    deadlines.push(
      makeDeadline(
        'Hold team briefing: review peak-season protocols, backup procedures, and escalation contacts',
        protocolDeadline,
        PROTOCOL_REVIEW_LEAD,
        'protocol',
        'Briefing should cover: worklist priority changes, QC frequency increase, batch processing rules, reagent FIFO.',
      ),
    )

    // Also add a deadline for any high-priority protocol recommendations
    for (const rec of plan.protocolRecommendations) {
      if (rec.priority === 'high') {
        deadlines.push(
          makeDeadline(
            `Implement: ${rec.recommendation.slice(0, 80)}${rec.recommendation.length > 80 ? '…' : ''}`,
            rec.effectiveDate,
            PROTOCOL_REVIEW_LEAD,
            'protocol',
            `Category: ${rec.category}. Priority: ${rec.priority}.`,
          ),
        )
      }
    }
  }

  // Sort: overdue first, then by deadline date ascending
  return deadlines.sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1
    if (!a.isOverdue && b.isOverdue) return 1
    return a.deadlineDate.localeCompare(b.deadlineDate)
  })
}
