'use client'

/**
 * usePrioritizedWorklist — Dexie-driven hook for the smart sample worklist.
 *
 * Reads samples (pipelineStatus: received | in-processing) from the local
 * Dexie DB, joins with orders for urgency + LOINC codes, computes priority
 * scores, applies batching and manual overrides, then re-sorts every 60 s.
 *
 * Entirely offline-first: no network calls, no Hub API dependency.
 * CLAUDE.md offline-first and data-minimization rules apply.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { getDb, getPriorityOverrides, setPriorityOverride, clearPriorityOverride } from '@/lib/db'
import {
  prioritizeSamples,
  applyManualOverrides,
  type PrioritizedSample,
  type SampleInput,
  type PriorityOverride,
  type SampleUrgency,
} from '@/lib/prioritization-engine'
import type { LabOrderEntry } from '@/lib/db'

const REFRESH_INTERVAL_MS = 60_000

export type WorklistMode = 'auto' | 'manual'

export interface UsePrioritizedWorklistResult {
  /** Ordered list of samples ready to process. */
  samples: PrioritizedSample[]
  loading: boolean
  error: string | null
  mode: WorklistMode
  setMode: (mode: WorklistMode) => void
  /**
   * Reorder a sample to a new 0-based position in the list.
   * Persists to Dexie and triggers re-render.
   */
  reorder: (sampleId: string, newPosition: number) => Promise<void>
  /**
   * Clear the manual override for a sample, reverting to algorithm order.
   */
  resetOverride: (sampleId: string) => Promise<void>
}

/** Extract the orderId from a FHIR Reference string like "ServiceRequest/<id>". */
function extractOrderId(reference: string): string | null {
  const parts = reference.split('/')
  return parts.length === 2 ? (parts[1] ?? null) : null
}

/** Map FHIR pipelineStatus values that count as "active" for the worklist. */
const ACTIVE_STATUSES = new Set(['received', 'in-processing'])

/** Map order urgency to internal SampleUrgency (handles 'asap' → 'urgent'). */
function mapUrgency(raw: LabOrderEntry['urgency']): SampleUrgency {
  if (raw === 'stat') return 'stat'
  if (raw === 'urgent' || raw === 'asap') return 'urgent'
  return 'routine'
}

export function usePrioritizedWorklist(): UsePrioritizedWorklistResult {
  const [samples, setSamples] = useState<PrioritizedSample[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<WorklistMode>('auto')

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelledRef = useRef(false)
  const inFlightRef = useRef(false)

  const fetchAndSort = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true

    try {
      const db = getDb()

      // 1. Load active samples from the samples table (Story 42.3 data)
      let sampleInputs: SampleInput[] = []

      try {
        // Attempt to use the samples table (may be empty if 42.3 not yet synced)
        const activeSamples = await db.samples
          .filter((s) => ACTIVE_STATUSES.has(s._ultranos.pipelineStatus))
          .toArray()

        if (activeSamples.length > 0) {
          // Build a map of orderId → order for join
          const orderIds = activeSamples.flatMap((s) =>
            (s.request ?? [])
              .map((ref) => extractOrderId(ref.reference))
              .filter((id): id is string => id !== null),
          )

          const orders = await db.orders
            .where('orderId')
            .anyOf(orderIds)
            .toArray()
          const orderMap = new Map(orders.map((o) => [o.orderId, o]))

          for (const specimen of activeSamples) {
            const orderId = extractOrderId(specimen.request?.[0]?.reference ?? '')
            if (!orderId) continue
            const order = orderMap.get(orderId)
            if (!order) continue

            const loincCode = order.testsRequested[0]?.loincCode ?? ''
            const loincDisplay = order.testsRequested[0]?.loincDisplay ?? ''

            sampleInputs.push({
              sampleId: specimen.id,
              orderId: order.orderId,
              patientRef: {
                firstName: order.patientFirstName,
                age: order.patientAge ?? 0,
              },
              loincCode,
              loincDisplay,
              urgency: mapUrgency(order.urgency),
              receivedAt: specimen.receivedTime,
            })
          }
        }
      } catch {
        // samples table unavailable — fall through to orders fallback
      }

      // Fallback: if samples table empty/unavailable, use orders directly.
      // Orders with RECEIVED or IN_PROGRESS status are treated as samples.
      if (sampleInputs.length === 0) {
        const activeOrders = await db.orders
          .filter((o) => o.status === 'RECEIVED' || o.status === 'IN_PROGRESS')
          .toArray()

        sampleInputs = activeOrders.map((order) => ({
          sampleId: order.orderId,
          orderId: order.orderId,
          patientRef: {
            firstName: order.patientFirstName,
            age: order.patientAge ?? 0,
          },
          loincCode: order.testsRequested[0]?.loincCode ?? '',
          loincDisplay: order.testsRequested[0]?.loincDisplay ?? '',
          urgency: mapUrgency(order.urgency),
          receivedAt: order.receivedAt,
        }))
      }

      // 2. Prioritize (pure computation, no network)
      const prioritized = prioritizeSamples(sampleInputs)

      // 3. Apply manual overrides (from Dexie)
      const rawOverrides = await getPriorityOverrides()
      const overrides: PriorityOverride[] = rawOverrides.map((o) => ({
        sampleId: o.sampleId,
        manualPosition: o.manualPosition,
        overriddenAt: o.overriddenAt,
      }))

      const finalList = mode === 'auto'
        ? applyManualOverrides(prioritized, overrides)
        : applyManualOverrides(prioritized, overrides) // manual mode: same list, no auto-resort

      if (!cancelledRef.current) {
        setSamples(finalList)
        setError(null)
        setLoading(false)
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load worklist')
        setLoading(false)
      }
    } finally {
      inFlightRef.current = false
    }
  }, [mode])

  useEffect(() => {
    cancelledRef.current = false
    fetchAndSort()

    if (mode === 'auto') {
      intervalRef.current = setInterval(fetchAndSort, REFRESH_INTERVAL_MS)
    }

    return () => {
      cancelledRef.current = true
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [fetchAndSort, mode])

  const reorder = useCallback(async (sampleId: string, newPosition: number) => {
    await setPriorityOverride(sampleId, newPosition)
    // Re-fetch immediately after override
    await fetchAndSort()
  }, [fetchAndSort])

  const resetOverride = useCallback(async (sampleId: string) => {
    await clearPriorityOverride(sampleId)
    await fetchAndSort()
  }, [fetchAndSort])

  return { samples, loading, error, mode, setMode, reorder, resetOverride }
}
