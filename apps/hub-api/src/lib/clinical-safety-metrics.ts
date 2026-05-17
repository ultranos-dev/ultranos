import { Counter, Gauge } from 'prom-client'
import { getMetricsRegistry } from '@/trpc/middleware/metrics'

/**
 * Clinical Safety Prometheus Metrics — Story 23.2 Task 1.
 *
 * Tracks drug interaction check completion, override rates, and
 * Tier 1 conflict status for clinical safety monitoring.
 *
 * Registered on the shared Story 23.1 registry so they are exposed
 * via the Prometheus /metrics endpoint alongside infrastructure metrics.
 */

const register = getMetricsRegistry()

// ─── Drug Interaction Check Metrics ───

export const drugInteractionChecksTotal = new Counter({
  name: 'drug_interaction_checks_total',
  help: 'Total drug interaction checks performed on prescription creation',
  labelNames: ['result'] as const, // CLEAR | WARNING | BLOCKED | UNAVAILABLE
  registers: [register],
})

export const drugInteractionOverridesTotal = new Counter({
  name: 'drug_interaction_overrides_total',
  help: 'Total drug interaction overrides on prescription creation',
  labelNames: ['severity'] as const, // CONTRAINDICATED | ALLERGY_MATCH | MAJOR | MODERATE
  registers: [register],
})

export const prescriptionsWithoutInteractionCheckTotal = new Counter({
  name: 'prescriptions_without_interaction_check_total',
  help: 'Prescriptions created with interaction check UNAVAILABLE',
  registers: [register],
})

// ─── Tier 1 Conflict Gauges ───

export const unresolvedTier1Conflicts = new Gauge({
  name: 'unresolved_tier1_conflicts',
  help: 'Current count of unresolved Tier 1 sync conflicts',
  registers: [register],
})

export const oldestTier1ConflictAgeHours = new Gauge({
  name: 'oldest_tier1_conflict_age_hours',
  help: 'Age in hours of the oldest unresolved Tier 1 sync conflict',
  registers: [register],
})

// ─── Clinical Safety Alert Gauges ───

export const contraindicatedOverrideRate = new Gauge({
  name: 'contraindicated_override_rate_percent',
  help: 'CONTRAINDICATED override rate as percentage over 7-day rolling window',
  registers: [register],
})

export const interactionCheckCompletionRate = new Gauge({
  name: 'interaction_check_completion_rate_percent',
  help: 'Drug interaction check completion rate (last 24h)',
  registers: [register],
})

// ─── AI Clinical Scribe Metrics (Story 24.1) ───

export const aiScribeInvocationsTotal = new Counter({
  name: 'ai_scribe_invocations_total',
  help: 'Total AI clinical scribe invocations',
  labelNames: ['status'] as const, // success | error | consent_denied
  registers: [register],
})

export const aiScribeEditRate = new Gauge({
  name: 'ai_scribe_edit_rate_percent',
  help: 'AI scribe physician edit rate — how much physicians modify AI output (rolling average)',
  registers: [register],
})

// No separate registry export needed — metrics are on the shared Story 23.1 registry
