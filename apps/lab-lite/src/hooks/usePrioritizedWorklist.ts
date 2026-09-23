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
import { getDb, getPriorityOverrides, setPriorityOverride, clearPriorityOverride, getArchivedSampleIds } from '@/lib/db'
import { setSampleArchived } from '@/lib/sample-service'
import { isSpecimenHydrationSettled } from '@/lib/specimen-hydrate'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import {
  prioritizeSamples,
  applyManualOverrides,
  type PrioritizedSample,
  type SampleInput,
  type PriorityOverride,
  type SampleUrgency,
} from '@/lib/prioritization-engine'
import type { LabOrderEntry, VerifiedPatientCache } from '@/lib/db'
import type { FhirSpecimen } from '@ultranos/shared-types'

const REFRESH_INTERVAL_MS = 60_000

export type WorklistMode = 'auto' | 'manual'

/** Which shelf the worklist is showing: the active queue or the archived shelf. */
export type WorklistStatusFilter = 'active' | 'archived'

export interface UsePrioritizedWorklistResult {
  /** Ordered list of samples ready to process. */
  samples: PrioritizedSample[]
  loading: boolean
  error: string | null
  mode: WorklistMode
  setMode: (mode: WorklistMode) => void
  /** Active vs Archived shelf. */
  statusFilter: WorklistStatusFilter
  setStatusFilter: (filter: WorklistStatusFilter) => void
  /**
   * Reorder a sample to a new 0-based position in the list.
   * Persists to Dexie and triggers re-render.
   */
  reorder: (sampleId: string, newPosition: number) => Promise<void>
  /**
   * Clear the manual override for a sample, reverting to algorithm order.
   */
  resetOverride: (sampleId: string) => Promise<void>
  /**
   * Archive (true) or unarchive (false) a sample, then refresh the list.
   */
  setArchived: (sampleId: string, archived: boolean) => Promise<void>
  /** Re-run the fetch/sort pipeline (e.g. after orders sync into Dexie). */
  refresh: () => Promise<void>
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

/**
 * Build a SampleInput from a specimen, with an optional matching order row.
 *
 * When `order` is provided, all enriched fields come from the order (the normal path).
 * When `order` is absent (orphan specimen), best-effort fallbacks are used:
 *   - patientRef: from `verifiedPatient` if available, else empty/zero.
 *   - loincCode/loincDisplay: from specimen._ultranos extension fields if stamped.
 *   - urgency: 'routine'.
 *   - orderId: extracted from the specimen's first request reference (kept even if row absent).
 */
function buildSampleInput(
  specimen: FhirSpecimen,
  orderId: string,
  order?: LabOrderEntry,
  verifiedPatient?: VerifiedPatientCache,
): SampleInput {
  // Resolution priority (never depend on any single source surviving):
  //   patient name/age : order row → specimen stamp → verified_patients cache
  //   ordered test     : order row → specimen stamp
  // The specimen stamp (written at accession) is the durable offline-first source.
  const ext = specimen._ultranos as {
    patientFirstName?: string
    patientAge?: number | null
    orderedTests?: Array<{ loincCode?: string; loincDisplay?: string }>
    orderedLoincCode?: string
  }

  const firstName =
    order?.patientFirstName ?? ext.patientFirstName ?? verifiedPatient?.firstName ?? ''
  const age =
    order?.patientAge ?? ext.patientAge ?? verifiedPatient?.age ?? 0

  const loincCode =
    order?.testsRequested?.[0]?.loincCode ??
    ext.orderedTests?.[0]?.loincCode ??
    ext.orderedLoincCode ??
    ''
  const loincDisplay =
    order?.testsRequested?.[0]?.loincDisplay ?? ext.orderedTests?.[0]?.loincDisplay ?? ''

  return {
    sampleId: specimen.id,
    orderId: order?.orderId ?? orderId,
    patientRef: { firstName, age: age ?? 0 },
    loincCode,
    loincDisplay,
    urgency: order ? mapUrgency(order.urgency) : 'routine',
    receivedAt: specimen.receivedTime,
  }
}

export function usePrioritizedWorklist(): UsePrioritizedWorklistResult {
  const [samples, setSamples] = useState<PrioritizedSample[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<WorklistMode>('auto')
  const [statusFilter, setStatusFilter] = useState<WorklistStatusFilter>('active')

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

      // Distinguish a genuine "samples table empty / not-yet-populated" from a
      // real Dexie read ERROR.  On a real error we must NOT silently fall through
      // to an empty worklist — that would be a false-negative (Bug 3).
      let samplesReadError: unknown = null
      try {
        // Archive state comes from the dedicated archived_samples table (durable
        // across re-hydration), NOT the specimen row.
        const archivedIds = await getArchivedSampleIds()
        // Attempt to use the samples table (may be empty if 42.3 not yet synced).
        // Active shelf: pipeline-active AND not archived.
        // Archived shelf: any archived sample (regardless of pipeline state).
        const activeSamples = await db.samples
          .filter((s) =>
            statusFilter === 'archived'
              ? archivedIds.has(s.id)
              : ACTIVE_STATUSES.has(s._ultranos.pipelineStatus) && !archivedIds.has(s.id),
          )
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

          // Specimens missing their display stamp but whose order is now known —
          // backfilled below so pre-stamp samples become durable/offline-safe.
          const backfills: FhirSpecimen[] = []

          for (const specimen of activeSamples) {
            const orderId = extractOrderId(specimen.request?.[0]?.reference ?? '')
            const order = orderId ? orderMap.get(orderId) : undefined

            // If no matching order row, fall back to verified_patients for patient info.
            // Never silently drop a collected sample — it must always appear in the worklist.
            // When orderId is null (malformed request reference), use empty string — the
            // specimen is still shown (orphan path) so the tech can act on it.
            let verifiedPatient: VerifiedPatientCache | undefined
            if (!order) {
              const patientId = extractOrderId(specimen.subject?.reference ?? '')
              if (patientId) {
                verifiedPatient = await db.verified_patients.get(patientId)
              }
            }

            sampleInputs.push(buildSampleInput(specimen, orderId ?? '', order, verifiedPatient))

            // Self-healing backfill: stamp the specimen from its order when the
            // stamp is absent (samples accessioned before stamping shipped). One-time
            // per specimen — once stamped, this branch is skipped.
            const ext = specimen._ultranos as { patientFirstName?: string }
            if (order && !ext.patientFirstName) {
              backfills.push({
                ...specimen,
                _ultranos: {
                  ...specimen._ultranos,
                  patientFirstName: order.patientFirstName,
                  patientAge: order.patientAge,
                  orderedTests: order.testsRequested,
                },
              })
            }
          }

          // Persist backfills best-effort — never block or fail the worklist render.
          if (backfills.length > 0) {
            void db.samples.bulkPut(backfills).catch(() => {})
          }
        }
        // else: legitimate empty — 42.3 not yet synced; sampleInputs stays []
      } catch (readErr) {
        // Real Dexie/DB error — record it so we can propagate as "unavailable"
        // instead of letting the hook show a false empty worklist.
        samplesReadError = readErr
      }

      // If a real read error occurred, re-throw so the outer catch sets error state.
      if (samplesReadError !== null) {
        throw samplesReadError
      }
      // NOTE: The orders-fallback (mapping un-accessioned orders to sampleId=orderId) has
      // been intentionally removed. The worklist lists ONLY real FhirSpecimen rows so that
      // every "Enter Results" link resolves to /results/<specimenId>/enter. Un-accessioned
      // orders belong on the Test Orders page, not here.

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
        // Never flash a false "no samples" empty state while the initial hub
        // hydration is still pending: keep loading until it settles when the
        // local result is empty. Offline → treat as settled (nothing to wait for).
        const offline = typeof navigator !== 'undefined' && !navigator.onLine
        const hydrationPending =
          finalList.length === 0 && !isSpecimenHydrationSettled() && !offline
        setLoading(hydrationPending)
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load worklist')
        setLoading(false)
      }
    } finally {
      inFlightRef.current = false
    }
  }, [mode, statusFilter])

  useEffect(() => {
    cancelledRef.current = false
    fetchAndSort()

    if (mode === 'auto') {
      intervalRef.current = setInterval(fetchAndSort, REFRESH_INTERVAL_MS)
    }

    // Re-fetch immediately when SyncProvider signals hydration is complete so
    // restored samples appear on the worklist right away (not after the 60 s tick).
    // fetchAndSort dedupes in-flight runs via inFlightRef, so concurrent fires are safe.
    // SSR guard: window is not available in the Next.js server environment.
    if (typeof window !== 'undefined') {
      const onHydrated = () => { void fetchAndSort() }
      window.addEventListener('lab-samples-hydrated', onHydrated)
      return () => {
        cancelledRef.current = true
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        window.removeEventListener('lab-samples-hydrated', onHydrated)
      }
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

  const setArchived = useCallback(async (sampleId: string, archived: boolean) => {
    const actorId = useAuthSessionStore.getState().session?.userId ?? 'unknown'
    await setSampleArchived(sampleId, archived, actorId)
    await fetchAndSort()
  }, [fetchAndSort])

  return {
    samples,
    loading,
    error,
    mode,
    setMode,
    statusFilter,
    setStatusFilter,
    reorder,
    resetOverride,
    setArchived,
    refresh: fetchAndSort,
  }
}
