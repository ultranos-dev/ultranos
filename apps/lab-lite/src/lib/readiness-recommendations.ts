/**
 * Readiness Recommendation Rules Engine — Story 48.3
 *
 * Maps dimension + RAG status + context to i18n recommendation keys.
 * All returned strings are i18n keys — never hardcoded text.
 * Returns empty array for green status (nothing to act on).
 * Caps output at 3 recommendations per dimension.
 */

import type { ReadinessDimension, RAGStatus } from '@/lib/readiness-engine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecommendationItem {
  /** i18n key for the recommendation message */
  key: string
  /** Interpolation values for the i18n message */
  args?: Record<string, string | number>
}

// ---------------------------------------------------------------------------
// Template rules per dimension × status
// ---------------------------------------------------------------------------

/**
 * Generates actionable recommendation items for a given dimension/status/context.
 *
 * @param dimension - Which readiness dimension is being evaluated
 * @param status    - RAG status of that dimension
 * @param context   - Structured context data used for interpolation or rule selection
 * @returns Array of i18n key + args objects (empty for green or unknown inputs)
 */
export function generateRecommendations(
  dimension: ReadinessDimension,
  status: RAGStatus,
  context: Record<string, unknown>,
): RecommendationItem[] {
  if (status === 'green') return []

  switch (dimension) {
    case 'personnel':
      return generatePersonnelRecommendations(status, context)
    case 'reagents':
      return generateReagentRecommendations(status, context)
    case 'equipment':
      return generateEquipmentRecommendations(status, context)
    case 'pendingOrders':
      return generateOrderRecommendations(status, context)
    case 'power':
      return generatePowerRecommendations(status, context)
    default:
      return []
  }
}

// ---------------------------------------------------------------------------
// Personnel
// ---------------------------------------------------------------------------

function generatePersonnelRecommendations(
  status: RAGStatus,
  _context: Record<string, unknown>,
): RecommendationItem[] {
  if (status === 'red') {
    return [{ key: 'readiness.recommendations.personnelRed' }]
  }
  // amber — no roster configured
  return [{ key: 'readiness.recommendations.personnelAmber' }]
}

// ---------------------------------------------------------------------------
// Reagents
// ---------------------------------------------------------------------------

function generateReagentRecommendations(
  status: RAGStatus,
  context: Record<string, unknown>,
): RecommendationItem[] {
  const items: RecommendationItem[] = []

  // Context may contain arrays of reagent issues when called from the engine;
  // or a single reagent's context when called per-reagent.
  const reagentIssues = context.issues as Array<{
    reagentName: string
    testType: string
    supplierName?: string
    daysRemaining?: number
    isRed: boolean
  }> | undefined

  if (reagentIssues && reagentIssues.length > 0) {
    for (const issue of reagentIssues.slice(0, 3)) {
      if (issue.isRed || status === 'red') {
        items.push({
          key: 'readiness.recommendations.reagentsRed',
          args: {
            reagentName: issue.reagentName,
            testType: issue.testType,
            supplierName: issue.supplierName ?? 'supplier',
          },
        })
      } else {
        items.push({
          key: 'readiness.recommendations.reagentsAmber',
          args: {
            reagentName: issue.reagentName,
            daysRemaining: issue.daysRemaining ?? 0,
            testType: issue.testType,
          },
        })
      }
    }
    return items
  }

  // Fallback: single-issue context (e.g., { reagentName, testType, supplierName, daysRemaining })
  if (status === 'red') {
    items.push({
      key: 'readiness.recommendations.reagentsRed',
      args: {
        reagentName: String(context.reagentName ?? ''),
        testType: String(context.testType ?? ''),
        supplierName: String(context.supplierName ?? 'supplier'),
      },
    })
  } else {
    items.push({
      key: 'readiness.recommendations.reagentsAmber',
      args: {
        reagentName: String(context.reagentName ?? ''),
        daysRemaining: Number(context.daysRemaining ?? 0),
        testType: String(context.testType ?? ''),
      },
    })
  }

  // Unavailable fallback
  if (!context.reagentName && !reagentIssues) {
    return [{ key: 'readiness.recommendations.reagentsUnavailable' }]
  }

  return items
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

function generateEquipmentRecommendations(
  status: RAGStatus,
  context: Record<string, unknown>,
): RecommendationItem[] {
  if (status === 'red') {
    return [
      {
        key: 'readiness.recommendations.equipmentRed',
        args: {
          equipmentName: String(context.equipmentName ?? ''),
          affectedTests: String(context.affectedTests ?? ''),
        },
      },
    ]
  }
  // amber — maintenance due or not configured
  return [{ key: 'readiness.recommendations.equipmentAmber' }]
}

// ---------------------------------------------------------------------------
// Pending Orders
// ---------------------------------------------------------------------------

function generateOrderRecommendations(
  status: RAGStatus,
  context: Record<string, unknown>,
): RecommendationItem[] {
  if (status === 'red') {
    return [
      {
        key: 'readiness.recommendations.ordersRed',
        args: { urgentCount: Number(context.urgentCount ?? 0) },
      },
    ]
  }
  return [
    {
      key: 'readiness.recommendations.ordersAmber',
      args: { pendingCount: Number(context.pendingCount ?? 0) },
    },
  ]
}

// ---------------------------------------------------------------------------
// Power
// ---------------------------------------------------------------------------

function generatePowerRecommendations(
  status: RAGStatus,
  context: Record<string, unknown>,
): RecommendationItem[] {
  if (status === 'red') {
    return [{ key: 'readiness.recommendations.powerRed' }]
  }
  // amber — no schedule or partially elapsed
  if (context.percentElapsed !== undefined) {
    return [
      {
        key: 'readiness.recommendations.powerPartialAmber',
        args: {
          percentElapsed: Number(context.percentElapsed),
          remainingMinutes: Number(context.remainingMinutes ?? 0),
        },
      },
    ]
  }
  return [{ key: 'readiness.recommendations.powerAmber' }]
}
