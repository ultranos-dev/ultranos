'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePatientStore } from '@/stores/patient-store'
import { useEncounterStore } from '@/stores/encounter-store'
import { useSoapNoteStore } from '@/stores/soap-note-store'
import { SOAPNoteEntry } from '@/components/clinical/soap-note-entry'
import { VitalsForm } from '@/components/clinical/vitals-form'
import { AutosaveIndicator } from '@/components/clinical/autosave-indicator'
import { useAutosave } from '@/lib/use-autosave'
import { useVitalsStore } from '@/stores/vitals-store'
import { db } from '@/lib/db'
import { useRouter } from 'next/navigation'
import type { FhirPatient } from '@ultranos/shared-types'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { useCommandPalette } from '@/hooks/use-command-palette'
import { usePrescriptionStore } from '@/stores/prescription-store'
import { PrescriptionEntry } from '@/components/clinical/PrescriptionEntry'
import type { PrescriptionFormData } from '@/lib/prescription-config'

interface EncounterDashboardProps {
  patientId: string
}

function formatAge(birthDate?: string, birthYearOnly?: boolean): string {
  if (!birthDate) return 'Unknown age'
  const birth = new Date(birthDate)
  const now = new Date()
  if (birthYearOnly) {
    return `~${now.getFullYear() - birth.getFullYear()}y`
  }
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--
  }
  return `${age}y`
}

// Placeholder — in production this comes from the auth session
const PRACTITIONER_REF = 'Practitioner/current-user'

export function EncounterDashboard({ patientId }: EncounterDashboardProps) {
  const router = useRouter()
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette()
  const selectedPatient = usePatientStore((s) => s.selectedPatient)
  const [dexiePatient, setDexiePatient] = useState<FhirPatient | null>(null)
  const [loading, setLoading] = useState(false)

  // Shallow selectors to prevent unnecessary re-renders (perf guardrail)
  const activeEncounter = useEncounterStore((s) => s.activeEncounter)
  const isStarting = useEncounterStore((s) => s.isStarting)
  const startEncounter = useEncounterStore((s) => s.startEncounter)
  const endEncounter = useEncounterStore((s) => s.endEncounter)
  const loadActiveEncounter = useEncounterStore((s) => s.loadActiveEncounter)

  // SOAP note state
  const subjective = useSoapNoteStore((s) => s.subjective)
  const objective = useSoapNoteStore((s) => s.objective)
  const setSubjective = useSoapNoteStore((s) => s.setSubjective)
  const setObjective = useSoapNoteStore((s) => s.setObjective)
  const autosaveStatus = useSoapNoteStore((s) => s.autosaveStatus)
  const initForEncounter = useSoapNoteStore((s) => s.initForEncounter)
  const persistToLedger = useSoapNoteStore((s) => s.persistToLedger)
  const loadFromLedger = useSoapNoteStore((s) => s.loadFromLedger)

  const { trigger: triggerAutosave, flush: flushAutosave } = useAutosave({
    onSave: persistToLedger,
    delay: 300,
  })

  // Vitals state
  const vWeight = useVitalsStore((s) => s.weight)
  const vHeight = useVitalsStore((s) => s.height)
  const vSystolic = useVitalsStore((s) => s.systolic)
  const vDiastolic = useVitalsStore((s) => s.diastolic)
  const vTemperature = useVitalsStore((s) => s.temperature)
  const setWeight = useVitalsStore((s) => s.setWeight)
  const setHeight = useVitalsStore((s) => s.setHeight)
  const setSystolic = useVitalsStore((s) => s.setSystolic)
  const setDiastolic = useVitalsStore((s) => s.setDiastolic)
  const setTemperature = useVitalsStore((s) => s.setTemperature)
  const vitalsAutosaveStatus = useVitalsStore((s) => s.autosaveStatus)
  const initVitalsForEncounter = useVitalsStore((s) => s.initForEncounter)
  const persistVitals = useVitalsStore((s) => s.persistObservations)
  const loadVitals = useVitalsStore((s) => s.loadFromObservations)
  const getBmi = useVitalsStore((s) => s.getBmi)
  const getRangeStatuses = useVitalsStore((s) => s.getRangeStatuses)

  const { trigger: triggerVitalsAutosave, flush: flushVitalsAutosave } = useAutosave({
    onSave: persistVitals,
    delay: 300,
  })

  // Prescription state
  const pendingPrescriptions = usePrescriptionStore((s) => s.pendingPrescriptions)
  const addPrescription = usePrescriptionStore((s) => s.addPrescription)
  const removePrescription = usePrescriptionStore((s) => s.removePrescription)
  const loadPrescriptions = usePrescriptionStore((s) => s.loadPrescriptions)
  const [prescriptionError, setPrescriptionError] = useState<string | null>(null)

  // Load patient from Dexie on page refresh / direct nav
  useEffect(() => {
    if (!selectedPatient || selectedPatient.id !== patientId) {
      setLoading(true)
      db.patients.get(patientId).then((patient) => {
        if (patient) {
          setDexiePatient(patient)
          usePatientStore.getState().selectPatient(patient)
        }
        setLoading(false)
      }).catch(() => {
        setLoading(false)
      })
    }
  }, [patientId, selectedPatient])

  // Load any active encounter from Dexie for this patient
  useEffect(() => {
    loadActiveEncounter(patientId)
  }, [patientId, loadActiveEncounter])

  // Initialize SOAP note and vitals when encounter becomes active
  useEffect(() => {
    if (activeEncounter?.status !== 'in-progress') return
    initForEncounter(activeEncounter.id)
    loadFromLedger(activeEncounter.id)
    initVitalsForEncounter(activeEncounter.id, patientId)
    loadVitals(activeEncounter.id)
    loadPrescriptions(activeEncounter.id)
  }, [activeEncounter?.id, activeEncounter?.status, initForEncounter, loadFromLedger, initVitalsForEncounter, loadVitals, loadPrescriptions])

  const handleSubjectiveChange = useCallback((value: string) => {
    setSubjective(value)
    triggerAutosave()
  }, [setSubjective, triggerAutosave])

  const handleObjectiveChange = useCallback((value: string) => {
    setObjective(value)
    triggerAutosave()
  }, [setObjective, triggerAutosave])

  const handleWeightChange = useCallback((v: string) => { setWeight(v); triggerVitalsAutosave() }, [setWeight, triggerVitalsAutosave])
  const handleHeightChange = useCallback((v: string) => { setHeight(v); triggerVitalsAutosave() }, [setHeight, triggerVitalsAutosave])
  const handleSystolicChange = useCallback((v: string) => { setSystolic(v); triggerVitalsAutosave() }, [setSystolic, triggerVitalsAutosave])
  const handleDiastolicChange = useCallback((v: string) => { setDiastolic(v); triggerVitalsAutosave() }, [setDiastolic, triggerVitalsAutosave])
  const handleTemperatureChange = useCallback((v: string) => { setTemperature(v); triggerVitalsAutosave() }, [setTemperature, triggerVitalsAutosave])

  const handleAddPrescription = useCallback(async (form: PrescriptionFormData) => {
    if (!activeEncounter) return
    setPrescriptionError(null)
    try {
      await addPrescription(form, activeEncounter.id, patientId, PRACTITIONER_REF)
    } catch (err) {
      setPrescriptionError(err instanceof Error ? err.message : 'Failed to save prescription')
    }
  }, [activeEncounter, addPrescription, patientId])

  const handleRemovePrescription = useCallback(async (id: string) => {
    setPrescriptionError(null)
    try {
      await removePrescription(id)
    } catch (err) {
      setPrescriptionError(err instanceof Error ? err.message : 'Failed to cancel prescription')
    }
  }, [removePrescription])

  const handleStartEncounter = useCallback(async () => {
    await startEncounter(patientId, PRACTITIONER_REF)
  }, [patientId, startEncounter])

  const handleEndEncounter = useCallback(async () => {
    flushAutosave()
    flushVitalsAutosave()
    await endEncounter()
  }, [endEncounter, flushAutosave, flushVitalsAutosave])

  const patient = (selectedPatient?.id === patientId ? selectedPatient : null) ?? dexiePatient

  // Reset palette state when entering/exiting loading to prevent desync
  useEffect(() => {
    if (loading) setPaletteOpen(false)
  }, [loading, setPaletteOpen])

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="font-semibold text-neutral-500">Loading patient...</p>
      </main>
    )
  }

  if (!patient) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="font-semibold text-neutral-500">Patient not found in local session.</p>
        <button
          onClick={() => router.push('/')}
          className="mt-4 font-semibold text-primary-500 underline"
        >
          Return to Patient Search
        </button>
      </main>
    )
  }

  const isActive = activeEncounter?.status === 'in-progress'

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <header className="mb-8">
        <button
          onClick={() => router.push('/')}
          className="mb-4 text-sm font-semibold text-primary-500 hover:underline"
          aria-label="Back to search"
        >
          ← Back to Search
        </button>
        <h1 className="text-3xl font-black tracking-tight text-neutral-900">
          Encounter Dashboard
        </h1>
      </header>

      <section
        className="rounded-lg border border-neutral-200 bg-white p-6"
        aria-label="Patient information"
      >
        <h2 className="text-xl font-bold text-neutral-900">
          {patient._ultranos?.nameLocal}
        </h2>
        {patient._ultranos?.nameLatin && (
          <p className="text-sm font-semibold text-neutral-500">
            {patient._ultranos.nameLatin}
          </p>
        )}
        <div className="mt-3 flex gap-4 text-sm font-semibold text-neutral-600">
          <span>ID: {patient.id.slice(0, 8)}...</span>
          <span>{patient.gender ?? 'Unknown'}</span>
          <span>{formatAge(patient.birthDate, patient.birthYearOnly)}</span>
        </div>
      </section>

      {/* Encounter status + controls */}
      <section
        className="mt-6 rounded-lg border border-neutral-200 bg-white p-6"
        aria-label="Encounter status"
      >
        {isActive ? (
          <>
            <div className="flex items-center gap-3">
              <span
                className="inline-block h-3 w-3 rounded-full bg-green-500"
                aria-hidden="true"
              />
              <span className="text-lg font-bold text-green-700" role="status">
                Active Consultation
              </span>
            </div>
            <p className="mt-2 text-sm text-neutral-500">
              Started: {activeEncounter.period.start
                ? new Date(activeEncounter.period.start).toLocaleTimeString()
                : 'Unknown'}
            </p>
            <button
              onClick={handleEndEncounter}
              className="mt-4 rounded-md bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-300"
            >
              End Encounter
            </button>
          </>
        ) : (
          <>
            <p className="mb-4 font-semibold text-neutral-500">
              No active consultation
            </p>
            <button
              onClick={handleStartEncounter}
              disabled={isStarting}
              className="rounded-md bg-green-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              {isStarting ? 'Starting...' : 'Start Encounter'}
            </button>
          </>
        )}
      </section>

      {/* Vital Signs — visible only during active encounter */}
      {isActive && (
        <section
          className="mt-6 rounded-lg border border-neutral-200 bg-white p-6"
          aria-label="Vital signs"
          data-section="vitals"
          tabIndex={-1}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-neutral-900">Vital Signs</h2>
            <AutosaveIndicator status={vitalsAutosaveStatus} />
          </div>
          <VitalsForm
            weight={vWeight}
            height={vHeight}
            systolic={vSystolic}
            diastolic={vDiastolic}
            temperature={vTemperature}
            onWeightChange={handleWeightChange}
            onHeightChange={handleHeightChange}
            onSystolicChange={handleSystolicChange}
            onDiastolicChange={handleDiastolicChange}
            onTemperatureChange={handleTemperatureChange}
            bmi={getBmi()}
            rangeStatuses={getRangeStatuses()}
          />
        </section>
      )}

      {/* SOAP Note Entry — visible only during active encounter */}
      {isActive && (
        <section
          className="mt-6 rounded-lg border border-neutral-200 bg-white p-6"
          aria-label="SOAP note entry"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-neutral-900">Clinical Notes</h2>
            <AutosaveIndicator status={autosaveStatus} />
          </div>
          <SOAPNoteEntry
            subjective={subjective}
            objective={objective}
            onSubjectiveChange={handleSubjectiveChange}
            onObjectiveChange={handleObjectiveChange}
          />
        </section>
      )}

      {/* Prescriptions — visible only during active encounter */}
      {isActive && (
        <section
          className="mt-6 rounded-lg border border-neutral-200 bg-white p-6"
          aria-label="Prescriptions"
          data-section="prescriptions"
          tabIndex={-1}
        >
          {/* Drug interaction check unavailable warning — CLAUDE.md safety rule #3 */}
          <div
            className="mb-4 rounded-lg border border-amber-300 bg-amber-50 ps-4 pe-4 py-3"
            role="alert"
          >
            <p className="text-sm font-bold text-amber-800">
              ⚠ Drug interaction check unavailable
            </p>
            <p className="text-xs text-amber-700">
              Interaction checking is not yet available. Verify prescriptions manually before dispensing.
            </p>
          </div>

          <PrescriptionEntry onSubmit={handleAddPrescription} />

          {prescriptionError && (
            <div className="mt-3 rounded-lg border border-red-300 bg-red-50 ps-4 pe-4 py-3" role="alert">
              <p className="text-sm font-semibold text-red-800">{prescriptionError}</p>
            </div>
          )}

          {/* Pending prescriptions list */}
          {pendingPrescriptions.length > 0 && (
            <div className="mt-6 space-y-3">
              <h4 className="text-sm font-bold text-neutral-700">
                Pending Prescriptions ({pendingPrescriptions.length})
              </h4>
              <ul className="space-y-2" aria-label="Pending prescriptions list">
                {pendingPrescriptions.map((rx) => (
                  <li
                    key={rx.id}
                    className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white ps-4 pe-4 py-3"
                  >
                    <div>
                      <span className="font-semibold text-neutral-900">
                        {rx.medicationCodeableConcept.text}
                      </span>
                      <span className="ms-2 me-2 text-neutral-300">|</span>
                      <span className="text-sm text-neutral-600">
                        {rx.dosageInstruction?.[0]?.text}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-amber-100 ps-3 pe-3 py-1 text-xs font-bold text-amber-700">
                        Pending Fulfillment
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemovePrescription(rx.id)}
                        className="text-sm font-semibold text-red-500 hover:text-red-700 transition-colors"
                        aria-label={`Cancel prescription for ${rx.medicationCodeableConcept.text}`}
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Assessment — placeholder for command palette targeting */}
      {isActive && (
        <section
          className="mt-6 rounded-lg border border-neutral-200 bg-white p-6"
          aria-label="Assessment"
          data-section="assessment"
          tabIndex={-1}
        >
          <h2 className="text-lg font-bold text-neutral-900">Assessment</h2>
          <p className="mt-2 text-sm text-neutral-400">
            Assessment entry will be available in a future update.
          </p>
        </section>
      )}
    </main>
  )
}
