'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/db'
import type { LocalObservation, LocalCondition, LocalMedicationRequest, LocalAllergyIntolerance, SoapLedgerEntry } from '@/lib/db'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'

interface EncounterDetailProps {
  encounterId: string
  encounterDate?: string
  patientId: string
}

interface EncounterDetailData {
  vitals: LocalObservation[]
  soap: SoapLedgerEntry | null
  allSoapEntries: SoapLedgerEntry[]
  diagnoses: LocalCondition[]
  prescriptions: LocalMedicationRequest[]
  allergiesAtVisit: LocalAllergyIntolerance[]
}

function formatVital(obs: LocalObservation): { label: string; value: string } {
  const code = obs.code?.coding?.[0]?.display || obs.code?.text || 'Unknown'
  const val = obs.valueQuantity
    ? `${obs.valueQuantity.value} ${obs.valueQuantity.unit ?? ''}`
    : (obs as LocalObservation & { valueString?: string }).valueString ?? '-'
  return { label: code, value: val.trim() }
}

export function EncounterDetail({ encounterId, encounterDate, patientId }: EncounterDetailProps) {
  const [data, setData] = useState<EncounterDetailData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadDetail() {
      try {
        // Load all detail data in parallel
        const [vitals, soapEntries, diagnoses, prescriptions, allAllergies] = await Promise.all([
          db.observations
            .where('encounter.reference')
            .equals(`Encounter/${encounterId}`)
            .toArray(),
          db.soapLedger
            .where('encounterId')
            .equals(encounterId)
            .toArray(),
          db.conditions
            .where('encounter.reference')
            .equals(`Encounter/${encounterId}`)
            .toArray(),
          db.medications
            .where('encounter.reference')
            .equals(`Encounter/${encounterId}`)
            .toArray(),
          db.allergyIntolerances
            .where('patient.reference')
            .equals(`Patient/${patientId}`)
            .toArray(),
        ])

        // Get latest SOAP entry
        soapEntries.sort((a: SoapLedgerEntry, b: SoapLedgerEntry) =>
          b.hlcTimestamp.localeCompare(a.hlcTimestamp),
        )
        const latestSoap = soapEntries[0] ?? null

        // Filter allergies to those recorded at or before encounter date
        // Safety: if encounterDate is invalid, show ALL allergies (CLAUDE.md Rule #4 — never suppress allergy data)
        let allergiesAtVisit = allAllergies
        if (encounterDate) {
          const encDate = new Date(encounterDate)
          if (!isNaN(encDate.getTime())) {
            allergiesAtVisit = allAllergies.filter((a) => {
              const recorded = a.recordedDate ?? a._ultranos?.hlcTimestamp?.split('_')[0]
              if (!recorded) return true // include if no date info
              const recordedDate = new Date(recorded)
              if (isNaN(recordedDate.getTime())) return true // include if recorded date is invalid
              return recordedDate <= encDate
            })
          }
        }

        if (!cancelled) {
          setData({
            vitals,
            soap: latestSoap,
            allSoapEntries: soapEntries,
            diagnoses,
            prescriptions,
            allergiesAtVisit,
          })
          auditPhiAccess(
            AuditAction.READ,
            AuditResourceType.ENCOUNTER,
            encounterId,
            patientId,
            { phiAccess: 'encounter_detail_expansion' },
          )
        }
      } catch {
        // Audit the failed access attempt — CLAUDE.md Rule #6 requires every PHI access to be audited
        if (!cancelled) {
          auditPhiAccess(
            AuditAction.READ,
            AuditResourceType.ENCOUNTER,
            encounterId,
            patientId,
            { phiAccess: 'encounter_detail_expansion', accessFailed: true },
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadDetail()
    return () => { cancelled = true }
  }, [encounterId, encounterDate, patientId])

  if (loading) {
    return (
      <div className="border-t border-neutral-200 p-4" data-testid="encounter-detail-loading">
        <p className="text-sm text-neutral-500">Loading details...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="border-t border-neutral-200 p-4">
        <p className="text-sm text-neutral-500">Unable to load encounter details.</p>
      </div>
    )
  }

  return (
    <div
      className="border-t border-neutral-200 p-4 space-y-4"
      data-testid="encounter-detail"
    >
      {/* Allergy snapshot at time of visit */}
      {data.allergiesAtVisit.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-red-700">
            Allergies at Time of Visit
          </h4>
          <div className="mt-1 flex flex-wrap gap-1">
            {data.allergiesAtVisit.map((a) => (
              <span
                key={a.id}
                className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700"
                dir="auto"
              >
                {a._ultranos?.substanceFreeText || a.code?.text || 'Unknown'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Vital Signs */}
      {data.vitals.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-neutral-500">
            Vital Signs
          </h4>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.vitals.map((obs) => {
              const v = formatVital(obs)
              return (
                <div
                  key={obs.id}
                  className="rounded-md bg-neutral-50 px-3 py-2"
                  data-testid="vital-item"
                >
                  <span className="text-xs font-semibold text-neutral-500">{v.label}</span>
                  <p className="text-sm font-bold text-neutral-900">{v.value}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* SOAP Notes — Story 24.1: Show all entries with AI badges */}
      {data.allSoapEntries.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-neutral-500">
            SOAP Notes
          </h4>
          <div className="mt-1 space-y-4">
            {data.allSoapEntries.map((entry) => (
              <div key={entry.id} className="rounded-md border border-neutral-100 bg-neutral-50 p-3">
                {/* AI source badge */}
                <div className="mb-2 flex items-center gap-2">
                  {entry.source === 'AI_GENERATED' && (
                    <span
                      className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700"
                      title={entry.aiModelVersion ? `Model: ${entry.aiModelVersion}` : undefined}
                    >
                      AI Generated
                    </span>
                  )}
                  {entry.source === 'AI_CONFIRMED' && (
                    <span
                      className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700"
                      title={entry.confirmedBy ? `Confirmed by: ${entry.confirmedBy}${entry.confirmedAt ? ` at ${new Date(entry.confirmedAt).toLocaleString()}` : ''}` : undefined}
                    >
                      AI Confirmed
                    </span>
                  )}
                  <span className="text-xs text-neutral-400">
                    {new Date(entry.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="space-y-1">
                  {entry.subjective && (
                    <div>
                      <span className="text-xs font-bold text-neutral-400">S — Subjective</span>
                      <p className="text-sm text-neutral-700" dir="auto">{entry.subjective}</p>
                    </div>
                  )}
                  {entry.objective && (
                    <div>
                      <span className="text-xs font-bold text-neutral-400">O — Objective</span>
                      <p className="text-sm text-neutral-700" dir="auto">{entry.objective}</p>
                    </div>
                  )}
                  {entry.assessment && (
                    <div>
                      <span className="text-xs font-bold text-neutral-400">A — Assessment</span>
                      <p className="text-sm text-neutral-700" dir="auto">{entry.assessment}</p>
                    </div>
                  )}
                  {entry.plan && (
                    <div>
                      <span className="text-xs font-bold text-neutral-400">P — Plan</span>
                      <p className="text-sm text-neutral-700" dir="auto">{entry.plan}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diagnoses */}
      {data.diagnoses.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-neutral-500">
            Diagnoses
          </h4>
          <ul className="mt-1 space-y-1">
            {data.diagnoses.map((c) => (
              <li
                key={c.id}
                className="text-sm text-neutral-700"
                dir="auto"
                data-testid="diagnosis-item"
              >
                <span className="font-semibold">
                  {c.code?.coding?.[0]?.code && `[${c.code.coding[0].code}] `}
                </span>
                {c.code?.text || c.code?.coding?.[0]?.display || 'Unspecified'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Prescriptions */}
      {data.prescriptions.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-neutral-500">
            Prescriptions
          </h4>
          <ul className="mt-1 space-y-1">
            {data.prescriptions.map((rx) => (
              <li
                key={rx.id}
                className="text-sm text-neutral-700"
                dir="auto"
                data-testid="prescription-item"
              >
                <span className="font-semibold">
                  {rx.medicationCodeableConcept?.text || 'Unknown medication'}
                </span>
                {rx.dosageInstruction?.[0]?.text && (
                  <span className="ms-2 text-neutral-500">
                    — {rx.dosageInstruction[0].text}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Empty state if nothing to show */}
      {data.vitals.length === 0 &&
        data.allSoapEntries.length === 0 &&
        data.diagnoses.length === 0 &&
        data.prescriptions.length === 0 &&
        data.allergiesAtVisit.length === 0 && (
          <p className="text-sm text-neutral-400">No clinical data recorded for this encounter.</p>
        )}
    </div>
  )
}
