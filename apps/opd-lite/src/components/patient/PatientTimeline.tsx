'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { db } from '@/lib/db'
import type { LocalEncounter } from '@/lib/db'
import { useAllergyStore } from '@/stores/allergy-store'
import { Skeleton } from '@ultranos/ui-kit/components/ui/skeleton'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { CalendarClock, Pill, AlertTriangle, ClipboardList } from '@ultranos/ui-kit/icons'

type EventKind = 'encounter' | 'medication' | 'allergy'

interface TimelineEvent {
  id: string
  kind: EventKind
  title: string
  subtitle: string
  ts: string // sortable (HLC or ISO); newest first
  dateLabel: string
}

/** HLC ("<wallMs>:<counter>:<node>") or ISO instant → Date. */
function parseTs(ts: string): Date | null {
  if (!ts) return null
  const head = ts.split(':')[0]!
  const date = /^\d+$/.test(head) ? new Date(Number(head)) : new Date(ts)
  return Number.isNaN(date.getTime()) ? null : date
}

function fmt(ts: string): string {
  const d = parseTs(ts)
  return d
    ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : ''
}

const DOT: Record<EventKind, string> = {
  encounter: 'bg-primary/15 text-primary',
  medication: 'bg-warning/20 text-warning',
  allergy: 'bg-destructive/10 text-destructive',
}

/**
 * Merged clinical timeline for the patient chart — chronological events across
 * encounters, prescriptions and allergies (newest first). Offline-first: reads
 * local Dexie + the allergy store; each source is best-effort so one failure
 * never blanks the whole timeline.
 */
export function PatientTimeline({ patientId }: { patientId: string }) {
  const t = useTranslations('patient')
  const tEnc = useTranslations('encounter')
  const allergies = useAllergyStore((s) => s.allergies)
  const [events, setEvents] = useState<TimelineEvent[] | null>(null)

  useEffect(() => {
    let cancelled = false

    async function build() {
      const collected: TimelineEvent[] = []

      // Encounters (patient-scoped)
      let encounters: LocalEncounter[] = []
      try {
        encounters = await db.encounters
          .where('subject.reference')
          .equals(`Patient/${patientId}`)
          .toArray()
        for (const enc of encounters) {
          const ts = enc._ultranos?.hlcTimestamp ?? enc.period?.start ?? enc.meta?.lastUpdated ?? ''
          const statusLabel =
            enc.status === 'in-progress' ? tEnc('inProgress')
            : enc.status === 'finished' ? tEnc('finished')
            : enc.status
          collected.push({
            id: `enc-${enc.id}`,
            kind: 'encounter',
            title: `${t('evConsultation')} — ${statusLabel}`,
            subtitle: enc.participant?.[0]?.individual?.display ?? '',
            ts,
            dateLabel: fmt(ts),
          })
        }
      } catch {
        // Encounters unavailable — skip this source.
      }

      // Prescriptions across the patient's encounters (best-effort)
      try {
        for (const enc of encounters) {
          const meds = await db.medications
            .where('encounter.reference')
            .equals(`Encounter/${enc.id}`)
            .toArray()
          for (const m of meds) {
            const rec = m as unknown as {
              id?: string
              authoredOn?: string
              medicationCodeableConcept?: { text?: string; coding?: { display?: string }[] }
              _ultranos?: { hlcTimestamp?: string }
            }
            const name = rec.medicationCodeableConcept?.text
              ?? rec.medicationCodeableConcept?.coding?.[0]?.display
              ?? ''
            const ts = rec._ultranos?.hlcTimestamp ?? rec.authoredOn ?? enc.period?.start ?? ''
            collected.push({
              id: `rx-${rec.id ?? crypto.randomUUID()}`,
              kind: 'medication',
              title: `${t('evPrescription')}${name ? ` — ${name}` : ''}`,
              subtitle: '',
              ts,
              dateLabel: fmt(ts),
            })
          }
        }
      } catch {
        // Medications unavailable — skip.
      }

      // Allergies (from the store, already patient-scoped + active)
      for (const a of allergies) {
        const substance = a.code?.text ?? a._ultranos?.substanceFreeText ?? ''
        const ts = a._ultranos?.hlcTimestamp ?? a.recordedDate ?? a.meta?.lastUpdated ?? ''
        collected.push({
          id: `al-${a.id}`,
          kind: 'allergy',
          title: `${t('evAllergyRecorded')}${substance ? ` — ${substance}` : ''}`,
          subtitle: a.criticality ? String(a.criticality) : '',
          ts,
          dateLabel: fmt(ts),
        })
      }

      collected.sort((x, y) => y.ts.localeCompare(x.ts))
      if (!cancelled) setEvents(collected)
    }

    void build()
    return () => { cancelled = true }
  }, [patientId, allergies, t, tEnc])

  if (events === null) {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-4/5" />
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex min-h-[16rem] items-center justify-center rounded-2xl border border-border bg-card shadow-card">
        <EmptyState icon={CalendarClock} title={t('noTimeline')} />
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
        {t('timelineTitle')}
      </h3>
      <ul className="divide-y divide-border" role="list" aria-label={t('timelineTitle')}>
        {events.map((ev) => {
          const Icon = ev.kind === 'medication' ? Pill : ev.kind === 'allergy' ? AlertTriangle : ClipboardList
          return (
            <li key={ev.id} className="flex items-start gap-3 px-4 py-3">
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${DOT[ev.kind]}`}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-foreground" dir="auto">{ev.title}</p>
                  {ev.dateLabel && (
                    <span className="shrink-0 text-xs text-muted-foreground font-numeric">{ev.dateLabel}</span>
                  )}
                </div>
                {ev.subtitle && <p className="truncate text-xs text-muted-foreground" dir="auto">{ev.subtitle}</p>}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
