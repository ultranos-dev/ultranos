/**
 * Story 48.2 — Predictive Reagent Burndown (stub)
 *
 * This module will be implemented in Story 48.2. It is referenced by the
 * Seasonal Planner (Story 54.6) via a dynamic import with graceful fallback.
 *
 * When this module is properly implemented, it should export:
 *   getBurndownProjections(): Promise<BurndownProjection[]>
 *
 * Until then, the stub throws to trigger the fallback to linear projection.
 */

export interface BurndownProjection {
  reagentId: string
  projectedDepletionDate: string | null
  confidenceLevel: 'high' | 'moderate' | 'low'
}

/**
 * Returns burndown projections for all active reagents.
 * Story 48.2 will provide the full implementation.
 */
export async function getBurndownProjections(): Promise<BurndownProjection[]> {
  throw new Error('Story 48.2 not yet implemented')
}
