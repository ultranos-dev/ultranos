'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { db } from '@/lib/db'
import type { LocalEncounter, SoapLedgerEntry } from '@/lib/db'
import { EncounterDetailModal } from '@/components/patient/EncounterDetailModal'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { StaleDataBanner } from '@ultranos/ui-kit'
import { Skeleton } from '@ultranos/ui-kit/components/ui/skeleton'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { buttonVariants } from '@ultranos/ui-kit/components/ui/button'
import { useSyncStore } from '@/stores/sync-store'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { AuthSession } from '@/stores/auth-session-store'
import { pullPatientChanges } from '@/lib/sync-pull'

interface SelfClinician {
  id: string
  name: string
}

// The clinician display name for the signed-in user. Same source as the
// sidebar NavUser: the full name from Supabase user_metadata (session.name,
// e.g. "Dr. Toor Khan"), falling back to the email local-part.
function deriveClinicianName(session: AuthSession | null): string {
  if (!session) return ''
  return session.name || (session.email ? session.email.split('@')[0] : '') || ''
}

interface EncounterSummary {
  encounter: LocalEncounter
  soapPreview: string
  diagnoses: string[]
  rxCount: number
  doctorName: string
}

interface EncounterHistoryListProps {
  patientId: string
}

// The display timestamp may be either a serialized HLC
// ("<wallMs>:<counter>:<nodeId>", where wallMs is epoch milliseconds) or a
// plain ISO 8601 instant (period.start / meta.lastUpdated). Resolve both.
function parseEncounterTimestamp(timestamp: string): Date | null {
  if (!timestamp) return null
  const head = timestamp.split(':')[0]!
  // All-digit leading segment → serialized HLC; first field is epoch ms.
  if (/^\d+$/.test(head)) {
    const date = new Date(Number(head))
    return Number.isNaN(date.getTime()) ? null : date
  }
  // Otherwise treat the whole value as an ISO 8601 instant.
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatEncounterDate(timestamp: string): string | null {
  const date = parseEncounterTimestamp(timestamp)
  if (!date) return null
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatEncounterTime(timestamp: string): string {
  const date = parseEncounterTimestamp(timestamp)
  if (!date) return ''
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getStatusBadge(status: string, t: (key: string) => string): { label: string; classes: string } {
  switch (status) {
    case 'finished':
      return { label: t('finished'), classes: 'bg-success/20 text-success' }
    case 'cancelled':
      return { label: t('cancelled'), classes: 'bg-muted text-muted-foreground' }
    case 'in-progress':
      return { label: t('inProgress'), classes: 'bg-primary/15 text-primary' }
    default:
      return { label: status, classes: 'bg-muted text-muted-foreground' }
  }
}

// Resolve a practitioner display name from the encounter's participant
// reference ("Practitioner/{id}") via the locally cached practitioner keys.
async function resolveDoctorName(enc: LocalEncounter, self: SelfClinician): Promise<string> {
  const individual = enc.participant?.[0]?.individual
  const id = individual?.reference?.replace('Practitioner/', '') ?? ''
  // 1. Display name carried on the encounter (e.g. from Hub sync).
  if (individual?.display) return individual.display
  // 2. Locally cached practitioner directory.
  if (id) {
    try {
      const key = await db.practitionerKeys.where('practitionerId').equals(id).first()
      if (key?.practitionerName) return key.practitionerName
    } catch {
      // fall through to the self fallback
    }
  }
  // 3. The signed-in clinician, when this is their encounter (or the
  //    participant is unrecorded — the common single-clinician device case).
  if (self.name && (!id || id === self.id)) return self.name
  return ''
}

async function buildSummaries(
  encounters: LocalEncounter[],
  self: SelfClinician,
): Promise<EncounterSummary[]> {
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

      const doctorName = await resolveDoctorName(enc, self)

      return { encounter: enc, soapPreview, diagnoses, rxCount, doctorName }
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
  const t = useTranslations('encounter')
  const [summaries, setSummaries] = useState<EncounterSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<EncounterSummary | null>(null)
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
    const session = useAuthSessionStore.getState().session
    const self: SelfClinician = {
      id: session?.practitionerId ?? '',
      name: deriveClinicianName(session),
    }
    const items = await buildSummaries(encounters, self)

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
      // TODO: Implement listPatientEncounters in trpc.ts (Story 20.5)
      // For now, Hub revalidation is handled by the sync engine pull path.
      if (!cancelled.current) {
        setRevalidationFailed(false)
      }
    } catch {
      // Offline or Hub unavailable — Dexie data remains authoritative
      if (!cancelled.current) {
        setRevalidationFailed(true)
      }
    }
  }, [])

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


  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  if (summaries.length === 0) {
    return (
      <EmptyState
        size="sm"
        title={t('noEncounters')}
        data-testid="no-encounters"
      />
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
    <ul className="space-y-3" role="list" aria-label={t('historyAria')}>
      {summaries.map((summary) => {
        const { encounter, soapPreview, diagnoses, rxCount, doctorName } = summary
        const badge = getStatusBadge(encounter.status, t)
        const isActive = encounter.status === 'in-progress'
        const ts = getEncounterTimestamp(encounter)
        const dateLabel = formatEncounterDate(ts)
        const timeLabel = formatEncounterTime(ts)

        return (
          <li
            key={encounter.id}
            className="rounded-xl bg-card shadow-sm ring-[0.65px] ring-border/50"
            data-testid="encounter-item"
          >
            <div className="flex items-stretch">
              {/* Card body — opens the encounter-detail modal */}
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl p-4 text-start transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                onClick={() => setSelected(summary)}
                aria-haspopup="dialog"
                aria-label={t('viewEncounterOn', { date: dateLabel ?? t('unknownDate') })}
              >
                {/* Date (bold) · Time · Doctor · [status badge] */}
                <span className="flex w-full flex-wrap items-center gap-x-1.5 gap-y-1 text-sm" dir="auto">
                  <span className="font-semibold text-foreground">{dateLabel ?? t('unknownDate')}</span>
                  {timeLabel && (
                    <>
                      <span className="text-muted-foreground" aria-hidden="true">·</span>
                      <span className="font-normal text-foreground">{timeLabel}</span>
                    </>
                  )}
                  {doctorName && (
                    <>
                      <span className="text-muted-foreground" aria-hidden="true">·</span>
                      <span className="font-normal text-foreground">{doctorName}</span>
                    </>
                  )}
                  <span
                    className={`ms-1 inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.classes}`}
                    data-testid="status-badge"
                  >
                    {badge.label}
                  </span>
                </span>

                {soapPreview && (
                  <span className="line-clamp-2 text-sm text-muted-foreground" dir="auto">
                    {soapPreview}
                  </span>
                )}

                {(diagnoses.length > 0 || rxCount > 0) && (
                  <span className="flex flex-wrap items-center gap-2">
                    {diagnoses.map((dx, i) => (
                      <span
                        key={i}
                        className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"
                        dir="auto"
                      >
                        {dx}
                      </span>
                    ))}
                    {rxCount > 0 && (
                      <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        {t('rxCount', { count: rxCount })}
                      </span>
                    )}
                  </span>
                )}
              </button>

              {/* Continue (active encounter only) — right side of the card */}
              {isActive && (
                <div className="flex shrink-0 items-center ps-2 pe-4">
                  <Link
                    href={`/encounter/${patientId}`}
                    className={buttonVariants({ variant: 'default' })}
                    aria-label={t('continueEncounterAria')}
                  >
                    {t('continueEncounter')}
                  </Link>
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ul>

    {selected && (
      <EncounterDetailModal
        open={!!selected}
        onOpenChange={(isOpen) => { if (!isOpen) setSelected(null) }}
        encounterId={selected.encounter.id}
        patientId={patientId}
        encounterDate={selected.encounter.period?.start}
        dateLabel={formatEncounterDate(getEncounterTimestamp(selected.encounter)) ?? t('unknownDate')}
        timeLabel={formatEncounterTime(getEncounterTimestamp(selected.encounter))}
        doctorName={selected.doctorName}
        status={getStatusBadge(selected.encounter.status, t)}
      />
    )}
    </div>
  )
}
