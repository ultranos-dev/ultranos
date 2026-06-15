/**
 * Outbreak queue priority sorting — Story 54.5 (AC #3)
 *
 * Extends the existing worklist/queue logic so that samples matching the
 * active outbreak's target test codes sort to the top.
 *
 * Priority sorting is additive: within the outbreak subset, existing
 * urgent/stat priorities are respected (AC #3.4 "additive").
 *
 * No PHI — sampleId and testCode are operational identifiers.
 */

import type { OutbreakModeConfig } from '@/types/outbreak'

/** Urgency ordering for within-tier sorting (lower = higher urgency). */
const URGENCY_ORDER: Record<string, number> = {
  stat: 0,
  asap: 1,
  urgent: 2,
  routine: 3,
}

export interface WorklistItem {
  sampleId: string
  testLoincCode: string
  urgency?: string
  receivedAt: string
}

export interface SortedWorklist {
  outbreakItems: WorklistItem[]
  standardItems: WorklistItem[]
}

/**
 * Split and sort a worklist into outbreak-priority and standard sections.
 *
 * Outbreak items:
 *   - Sorted first by urgency (stat > asap > urgent > routine)
 *   - Then by receivedAt ascending (FIFO within same urgency)
 *
 * Standard items:
 *   - Same sort order
 *
 * Returns { outbreakItems, standardItems } so the UI can render the
 * "Outbreak Priority (N samples)" section header separately.
 */
export function sortWorklistForOutbreak(
  items: WorklistItem[],
  activeOutbreak: OutbreakModeConfig | null,
): SortedWorklist {
  if (!activeOutbreak) {
    return {
      outbreakItems: [],
      standardItems: sortByUrgencyThenTime(items),
    }
  }

  const targetCodes = new Set(activeOutbreak.targetTestCodes)
  const outbreak: WorklistItem[] = []
  const standard: WorklistItem[] = []

  for (const item of items) {
    if (targetCodes.has(item.testLoincCode)) {
      outbreak.push(item)
    } else {
      standard.push(item)
    }
  }

  return {
    outbreakItems: sortByUrgencyThenTime(outbreak),
    standardItems: sortByUrgencyThenTime(standard),
  }
}

function sortByUrgencyThenTime(items: WorklistItem[]): WorklistItem[] {
  return [...items].sort((a, b) => {
    const urgencyA = URGENCY_ORDER[a.urgency ?? 'routine'] ?? 3
    const urgencyB = URGENCY_ORDER[b.urgency ?? 'routine'] ?? 3
    if (urgencyA !== urgencyB) return urgencyA - urgencyB
    return a.receivedAt.localeCompare(b.receivedAt)
  })
}
