'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { db } from '@/lib/db'
import type { LocalEncounter, SoapLedgerEntry } from '@/lib/db'
import { EncounterDetail } from '@/components/patient/EncounterDetail'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { listPatientEncounters } from '@/lib/trpc'
import { StaleDataBanner } from '@ultranos/ui-kit'
import { useSyncStore } from '@/stores/sync-store'
import { pullPatientChanges } from '@/lib/sync-pull'

interface EncounterSummary {
  encounter: LocalEncounter
  soapPreview: string
  diagnoses: string[]
  rxCount: number
}

interface EncounterHistoryListProps {
  patientId: string
}

function formatEncounterDate(hlcTimestamp: string): string {
  try {
    const iso = hlcTimestamp.split('_')[0]
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return hlcTimestamp
  }
}

function getStatusBadge(status: string): { label: string; classes: string } {
  switch (status) {
    case 'finished':
      return { label: 'Finished', classes: 'bg-green-100 text-green-700' }
    case 'cancelled':
      return { label: 'Cancelled', classes: 'bg-neutral-100 text-neutral-500' }
    case 'in-progress':
      return { label: 'In Progress', classes: 'bg-blue-100 text-blue-700' }
    default:
      return { label: status, classes: 'bg-neutral-100 text-neutral-500' }
  }
}

async function buildSummaries(encounters: LocalEncounter[]): Promise<EncounterSummary[]> {
  return Promise.all(
    encounters.map(async (enc) => {
      // Latest SOAP entry for preview
      let soapPreview = ''
      try {
        const soapEntries = await db.soapLedger
          .where('encounterId')
          .equals(enc.id)
          .toArray()
        soapEntries.sort((a: SoapLedgerEntry, b: SoapLedgerEntry) =>
          b.hlcTimestamp.localeCompare(a.hlcTimestamp),
        )
        const latest = soapEntries[0]
        if (latest?.subjective) {
          soapPreview =
            latest.subjective.length > 100
              ? latest.subjective.slice(0, 100) + '...'
              : latest.subjective
        }
      } catch {
        // SOAP data unavailable
      }

      // Diagnoses
      let diagnoses: string[] = []
      try {
        const conds = await db.conditions
          .where('encounter.reference')
          .equals(`Encounter/${enc.id}`)
          .toArray()
        diagnoses = conds
          .map((c) => c.code?.text || c.code?.coding?.[0]?.display || '')
          .filter(Boolean)
      } catch {
        // Conditions unavailable
      }

      // Prescription count
      let rxCount = 0
      try {
        rxCount = await db.medications
          .where('encounter.reference')
          .equals(`Encounter/${enc.id}`)
          .count()
      } catch {
        // Medications unavailable
      }

      return { encounter: enc, soapPreview, diagnoses, rxCount }
    }),
  )
}

function getEncounterTimestamp(enc: LocalEncounter): string {
  return enc._ultranos?.hlcTimestamp ?? enc.period?.start ?? enc.meta?.lastUpdated ?? ''
}

function sortEncountersDesc(encounters: LocalEncounter[]): void {
  encounters.sort((a, b) => {
    const tsA = getEncounterTimestamp(a)
    const tsB = getEncounterTimestamp(b)
    return tsB.localeCompare(tsA)
  })
}

export function EncounterHistoryList({ patientId }: EncounterHistoryListProps) {
  const [summaries, setSummaries] = useState<EncounterSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [localLastSyncedAt, setLocalLastSyncedAt] = useState<string | null>(null)
  const [revalidationFailed, setRevalidationFailed] = useState(false)
  const globalLastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  const lastSyncedAt = localLastSyncedAt ?? globalLastSyncedAt
  const cancelledRef = useRef({ current: false })
  const initialAuditFired = useRef(false)

  const loadFromDexie = useCallback(async (cancelled: { current: boolean }, options?: { skipAudit?: boolean }) => {
    const encounters = await db.encounters
      .where('subject.reference')
      .equals(`Patient/${patientId}`)
      .toArray()

    sortEncountersDesc(encounters)
    const items = await buildSummaries(encounters)

    if (!cancelled.current) {
      setSummaries(items)
      if (!options?.skipAudit && !initialAuditFired.current) {
        initialAuditFired.current = true
        auditPhiAccess(
          AuditAction.READ,
          AuditResourceType.ENCOUNTER,
          `patient-chart-list:${patientId}`,
          patientId,
          { phiAccess: 'encounter_history_list', count: items.length },
        )
      }
    }
    return items
  }, [patientId])

  const revalidateFromHub = useCallback(async (cancelled: { current: boolean }) => {
    try {
      const hubEncounters = await listPatientEncounters(patientId)
      // Only upsert Hub encounters that are newer than local versions (Tier 2 timestamp-based merge)
      if (hubEncounters.length > 0) {
        const toUpsert = await Promise.all(
          hubEncounters.map(async (hubEnc) => {
            const local = await db.encounters.get(hubEnc.id)
            if (!local) return hubEnc
            const localTs = local._ultranos?.hlcTimestamp ?? local.meta?.lastUpdated ?? ''
            const hubTs = hubEnc._ultranos?.hlcTimestamp ?? hubEnc.meta?.lastUpdated ?? ''
            return hubTs > localTs ? hubEnc : null
          }),
        )
        const filtered = toUpsert.filter((e): e is NonNullable<typeof e> => e !== null)
        if (filtered.length > 0) {
          await db.encounters.bulkPut(filtered)
        }
      }
      // Re-load from Dexie to get merged view (skip duplicate audit)
      await loadFromDexie(cancelled, { skipAudit: true })
      if (!cancelled.current) {
        setLocalLastSyncedAt(new Date().toISOString())
        setRevalidationFailed(false)
      }
    } catch {
      // Offline or Hub unavailable — Dexie data remains authoritative
      if (!cancelled.current) {
        setRevalidationFailed(true)
      }
    }
  }, [patientId, loadFromDexie])

  useEffect(() => {
    cancelledRef.current = { current: false }
    const cancelled = cancelledRef.current
    async function init() {
      try {
        // Step 1: Load from Dexie (instant, offline-first)
        await loadFromDexie(cancelled)
      } catch {
        // Dexie unavailable
      } finally {
        if (!cancelled.current) setLoading(false)
      }
      // Step 2: Background revalidation from Hub
      revalidateFromHub(cancelled)
    }
    init()
    return () => { cancelled.current = true }
  }, [loadFromDexie, revalidateFromHub])

  // Reload from Dexie when the sync engine pulls new data
  useEffect(() => {
    if (globalLastSyncedAt) {
      loadFromDexie(cancelledRef.current, { skipAudit: true })
      setRevalidationFailed(false)
    }
  }, [globalLastSyncedAt, loadFromDexie])

  const handleSyncNow = useCallback(async () => {
    console.log('[EncounterHistoryList] handleSyncNow clicked, patientId=', patientId)
    // Use the sync engine pull path, then fall back to legacy revalidation
    try {
      const { getSupabaseBrowserClient } = await import('@/lib/supabase')
      const { data } = await getSupabaseBrowserClient().auth.getSession()
      const token = data.session?.access_token ?? ''
      if (token) {
        await pullPatientChanges(patientId, () => token)
        await loadFromDexie(cancelledRef.current, { skipAudit: true })
        setLocalLastSyncedAt(new Date().toISOString())
        setRevalidationFailed(false)

        // Update global store so other components see the sync
        const state = useSyncStore.getState()
        state.updateSyncStatus({
          isPending: state.isPending,
          isError: state.isError,
          lastSyncedAt: new Date().toISOString(),
          pendingCount: state.pendingCount,
          failedCount: state.failedCount,
        })
        return
      }
    } catch {
      // Sync engine pull failed — fall through to legacy path
    }
    revalidateFromHub(cancelledRef.current)
  }, [patientId, loadFromDexie, revalidateFromHub])

  const handleToggleExpand = (encounterId: string) => {
    setExpandedId((prev) => (prev === encounterId ? null : encounterId))
  }

  if (loading) {
    return <p className="text-sm font-semibold text-neutral-500">Loading encounters...</p>
  }

  if (summaries.length === 0) {
    return (
      <p className="text-sm font-semibold text-neutral-400" data-testid="no-encounters">
        No encounters recorded for this patient
      </p>
    )
  }

  return (
    <div>
      {revalidationFailed && (
        <div className="mb-3">
          <StaleDataBanner
            lastSyncedAt={lastSyncedAt}
            failedCount={0}
            onSyncNow={handleSyncNow}
          />
        </div>
      )}
    <ul className="space-y-3" role="list" aria-label="Patient encounter history">
      {summaries.map(({ encounter, soapPreview, diagnoses, rxCount }) => {
        const badge = getStatusBadge(encounter.status)
        const isExpanded = expandedId === encounter.id

        return (
          <li
            key={encounter.id}
            className="rounded-lg border border-neutral-200 bg-white"
            data-testid="encounter-item"
          >
            <button
              type="button"
              className="w-full p-4 text-start transition-colors hover:bg-neutral-50"
              onClick={() => handleToggleExpand(encounter.id)}
              aria-expanded={isExpanded}
              aria-label={`Encounter on ${formatEncounterDate(getEncounterTimestamp(encounter))}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-neutral-900" dir="auto">
                  {formatEncounterDate(getEncounterTimestamp(encounter))}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${badge.classes}`}
                  data-testid="status-badge"
                >
                  {badge.label}
                </span>
              </div>

              {soapPreview && (
                <p className="mt-2 text-sm text-neutral-600 line-clamp-2" dir="auto">
                  {soapPreview}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {diagnoses.map((dx, i) => (
                  <span
                    key={i}
                    className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600"
                    dir="auto"
                  >
                    {dx}
                  </span>
                ))}
                {rxCount > 0 && (
                  <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                    {rxCount} Rx
                  </span>
                )}
              </div>
            </button>

            {isExpanded && (
              <EncounterDetail
                encounterId={encounter.id}
                encounterDate={encounter.period?.start}
                patientId={patientId}
              />
            )}
          </li>
        )
      })}
    </ul>
    </div>
  )
}
