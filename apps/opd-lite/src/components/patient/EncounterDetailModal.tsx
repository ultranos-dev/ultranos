'use client'

import type { ComponentType } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ultranos/ui-kit/components/ui/dialog'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import {
  Activity,
  AlertTriangle,
  Calculator,
  ClipboardList,
  FileText,
  HeartPulse,
  Pill,
  Ruler,
  Stethoscope,
  Thermometer,
  User,
  Weight,
} from '@ultranos/ui-kit/icons'
import type {
  LocalObservation,
  LocalCondition,
  LocalMedicationRequest,
} from '@/lib/db'
import { useEncounterDetailData, formatVital } from '@/components/patient/useEncounterDetailData'

interface EncounterDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  encounterId: string
  patientId: string
  /** ISO instant (period.start) used to filter the allergy snapshot. */
  encounterDate?: string
  dateLabel: string
  timeLabel: string
  doctorName?: string
  status?: { label: string; classes: string }
}

type IconType = ComponentType<{ className?: string }>

/** Recorded-time of a clinical record (HLC sorts lexicographically). */
function recordTs(r: { _ultranos?: { hlcTimestamp?: string } | null; meta?: { lastUpdated?: string } }): string {
  return r._ultranos?.hlcTimestamp ?? r.meta?.lastUpdated ?? ''
}

/**
 * Keep only the most recently recorded record per logical key, so the modal
 * shows current values rather than the full change history.
 */
function latestByKey<T>(items: T[], keyOf: (t: T) => string, tsOf: (t: T) => string): T[] {
  const map = new Map<string, T>()
  for (const it of items) {
    const key = keyOf(it)
    const existing = map.get(key)
    if (!existing || tsOf(it).localeCompare(tsOf(existing)) >= 0) map.set(key, it)
  }
  return Array.from(map.values())
}

const vitalKey = (o: LocalObservation) => o.code?.coding?.[0]?.code || o.code?.text || o.id
const conditionKey = (c: LocalCondition) => c.code?.coding?.[0]?.code || c.code?.text || c.id
const rxKey = (rx: LocalMedicationRequest) =>
  rx.medicationCodeableConcept?.coding?.[0]?.code || rx.medicationCodeableConcept?.text || rx.id

/** Pick a fitting icon for a vital based on its label. */
function vitalIcon(label: string): IconType {
  const l = label.toLowerCase()
  if (l.includes('temp')) return Thermometer
  if (l.includes('bmi') || l.includes('body mass')) return Calculator
  if (l.includes('height')) return Ruler
  if (l.includes('weight')) return Weight
  if (l.includes('puls') || l.includes('heart') || l.includes('bp') || l.includes('pressure') || l.includes('sat'))
    return HeartPulse
  return Activity
}

function Section({
  icon: Icon,
  title,
  danger,
  children,
}: {
  icon: IconType
  title: string
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={`rounded-2xl border p-3.5 ${
        danger ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card/40'
      }`}
    >
      <div className={`mb-2.5 flex items-center gap-2 ${danger ? 'text-destructive' : 'text-muted-foreground'}`}>
        <Icon className="size-4 shrink-0" />
        <h4 className="text-xs font-bold uppercase tracking-wide">{title}</h4>
      </div>
      {children}
    </section>
  )
}

function SoapField({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="rounded-xl bg-muted/60 px-3 py-2">
      <span className="text-[11px] font-bold uppercase tracking-wide text-primary">{label}</span>
      <p className="mt-0.5 text-sm text-foreground" dir="auto">
        {value}
      </p>
    </div>
  )
}

export function EncounterDetailModal({
  open,
  onOpenChange,
  encounterId,
  patientId,
  encounterDate,
  dateLabel,
  timeLabel,
  doctorName,
  status,
}: EncounterDetailModalProps) {
  // Only load (and audit) once the modal is actually shown.
  const { data, loading } = useEncounterDetailData(encounterId, patientId, {
    encounterDate,
    enabled: open,
    phiAccessLabel: 'encounter_detail_view',
  })

  // Latest value per item — no change history.
  const vitals = data ? latestByKey(data.vitals, vitalKey, recordTs) : []
  const diagnoses = data ? latestByKey(data.diagnoses, conditionKey, recordTs) : []
  const prescriptions = data ? latestByKey(data.prescriptions, rxKey, recordTs) : []
  const soap = data?.soap ?? null
  const allergies = data?.allergiesAtVisit ?? []

  const isEmpty =
    !!data &&
    allergies.length === 0 &&
    diagnoses.length === 0 &&
    vitals.length === 0 &&
    !soap &&
    prescriptions.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] gap-0 overflow-y-auto" data-testid="encounter-detail">
        {/* ── Header ─────────────────────────────────────────── */}
        <DialogHeader className="space-y-0 border-b border-border pb-4">
          <div className="flex items-center gap-3 pe-6">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Stethoscope className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex flex-wrap items-baseline gap-x-1.5 text-base" dir="auto">
                <span className="font-bold text-foreground">{dateLabel}</span>
                {timeLabel && (
                  <>
                    <span className="text-muted-foreground" aria-hidden="true">·</span>
                    <span className="font-normal text-muted-foreground">{timeLabel}</span>
                  </>
                )}
              </DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-2">
                {doctorName && (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
                    <User className="size-3.5 text-muted-foreground" />
                    <span dir="auto">{doctorName}</span>
                  </span>
                )}
                {status && (
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${status.classes}`}
                  >
                    {status.label}
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* ── Body ───────────────────────────────────────────── */}
        <div className="pt-4">
          {loading && (
            <p className="text-sm text-muted-foreground" data-testid="encounter-detail-loading">
              Loading details...
            </p>
          )}

          {!loading && !data && (
            <p className="text-sm text-muted-foreground">Unable to load encounter details.</p>
          )}

          {!loading && data && (
            <div className="space-y-3">
              {/* Allergies — CLAUDE.md Rule #4: first, in red, prominent */}
              {allergies.length > 0 && (
                <Section icon={AlertTriangle} title="Allergies at Time of Visit" danger>
                  <div className="flex flex-wrap gap-1.5">
                    {allergies.map((a) => (
                      <span
                        key={a.id}
                        className="inline-flex items-center rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-semibold text-destructive ring-1 ring-destructive/20"
                        dir="auto"
                      >
                        {a._ultranos?.substanceFreeText || a.code?.text || 'Unknown'}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {/* Diagnoses */}
              {diagnoses.length > 0 && (
                <Section icon={ClipboardList} title="Diagnoses">
                  <ul className="space-y-1.5">
                    {diagnoses.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-start gap-2 text-sm text-foreground"
                        dir="auto"
                        data-testid="diagnosis-item"
                      >
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                        <span>
                          {c.code?.coding?.[0]?.code && (
                            <span className="font-semibold text-muted-foreground">
                              [{c.code.coding[0].code}]{' '}
                            </span>
                          )}
                          {c.code?.text || c.code?.coding?.[0]?.display || 'Unspecified'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Vital Signs — latest reading per type */}
              {vitals.length > 0 && (
                <Section icon={HeartPulse} title="Vital Signs">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {vitals.map((obs) => {
                      const v = formatVital(obs)
                      const VIcon = vitalIcon(v.label)
                      return (
                        <div
                          key={obs.id}
                          className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 ring-[0.65px] ring-border/50"
                          data-testid="vital-item"
                        >
                          <VIcon className="size-4 shrink-0 text-primary" />
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-semibold text-muted-foreground">{v.label}</p>
                            <p className="text-sm font-bold text-foreground">{v.value}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Section>
              )}

              {/* SOAP Note — latest entry only */}
              {soap && (
                <Section icon={FileText} title="SOAP Note">
                  <div className="space-y-2">
                    {(soap.source === 'AI_GENERATED' || soap.source === 'AI_CONFIRMED') && (
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                          soap.source === 'AI_CONFIRMED'
                            ? 'bg-success/20 text-success'
                            : 'bg-primary/15 text-primary'
                        }`}
                      >
                        {soap.source === 'AI_CONFIRMED' ? 'AI Confirmed' : 'AI Generated'}
                      </span>
                    )}
                    <SoapField label="S — Subjective" value={soap.subjective} />
                    <SoapField label="O — Objective" value={soap.objective} />
                    <SoapField label="A — Assessment" value={soap.assessment} />
                    <SoapField label="P — Plan" value={soap.plan} />
                  </div>
                </Section>
              )}

              {/* Prescriptions — latest version per medication */}
              {prescriptions.length > 0 && (
                <Section icon={Pill} title="Prescriptions">
                  <ul className="space-y-2">
                    {prescriptions.map((rx) => (
                      <li
                        key={rx.id}
                        className="rounded-xl bg-muted/60 px-3 py-2"
                        dir="auto"
                        data-testid="prescription-item"
                      >
                        <p className="text-sm font-semibold text-foreground">
                          {rx.medicationCodeableConcept?.text || 'Unknown medication'}
                        </p>
                        {rx.dosageInstruction?.[0]?.text && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{rx.dosageInstruction[0].text}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {isEmpty && (
                <EmptyState
                  size="sm"
                  icon={FileText}
                  title="No clinical data"
                  description="Nothing was recorded for this encounter."
                />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
