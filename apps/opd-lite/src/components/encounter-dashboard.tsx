'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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
import { useTranslations } from 'next-intl'
import { checkInteractions, type InteractionCheckSummary, type InteractionResult } from '@/services/interactionService'
import { InteractionWarningModal } from '@/components/modals/InteractionWarningModal'
import { logInteractionCheck } from '@/services/interactionAuditService'
import { PrescriptionQR } from '@/components/clinical/PrescriptionQR'
import { AllergyBanner } from '@/components/clinical/AllergyBanner'
import { AllergyEntry } from '@/components/clinical/AllergyEntry'
import { useAllergyStore } from '@/stores/allergy-store'
import { getSigningKey, getPublicKey } from '@/lib/signing-key-store'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { checkAIProcessingConsent } from '@/services/ai-scribe-service'
import { ConflictBanner } from '@/components/sync/ConflictBanner'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/Card'
import { usePatientSync } from '@/hooks/usePatientSync'
import { hasUnresolvedTier1Conflicts } from '@/lib/conflict-check'

interface EncounterDashboardProps {
  patientId: string
}

function formatAge(birthDate?: string, birthYearOnly?: boolean, unknownLabel = 'Unknown age'): string {
  if (!birthDate) return unknownLabel
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

export function EncounterDashboard({ patientId }: EncounterDashboardProps) {
  const tPatient = useTranslations('patient')
  const tPrescription = useTranslations('prescription')
  const tEncounter = useTranslations('encounter')
  const tNav = useTranslations('nav')
  const tSoap = useTranslations('soap')
  const tAllergy = useTranslations('allergy')
  const practitionerRef = useAuthSessionStore((s) => s.session?.practitionerId ?? '')
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const router = useRouter()
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette()
  const selectedPatient = usePatientStore((s) => s.selectedPatient)
  const [dexiePatient, setDexiePatient] = useState<FhirPatient | null>(null)
  const [loading, setLoading] = useState(false)

  const { isSyncing: _isSyncing } = usePatientSync(patientId)
  const [prescriptionBlocked, setPrescriptionBlocked] = useState(false)

  // Shallow selectors to prevent unnecessary re-renders (perf guardrail)
  const activeEncounter = useEncounterStore((s) => s.activeEncounter)
  const isStarting = useEncounterStore((s) => s.isStarting)
  const startEncounter = useEncounterStore((s) => s.startEncounter)
  const endEncounter = useEncounterStore((s) => s.endEncounter)
  const loadActiveEncounter = useEncounterStore((s) => s.loadActiveEncounter)
  const isActive = activeEncounter?.status === 'in-progress'

  // SOAP note state
  const subjective = useSoapNoteStore((s) => s.subjective)
  const objective = useSoapNoteStore((s) => s.objective)
  const assessment = useSoapNoteStore((s) => s.assessment)
  const soapPlan = useSoapNoteStore((s) => s.plan)
  const setSubjective = useSoapNoteStore((s) => s.setSubjective)
  const setObjective = useSoapNoteStore((s) => s.setObjective)
  const setAssessment = useSoapNoteStore((s) => s.setAssessment)
  const setSoapPlan = useSoapNoteStore((s) => s.setPlan)
  const autosaveStatus = useSoapNoteStore((s) => s.autosaveStatus)
  const initForEncounter = useSoapNoteStore((s) => s.initForEncounter)
  const persistToLedger = useSoapNoteStore((s) => s.persistToLedger)
  const loadFromLedger = useSoapNoteStore((s) => s.loadFromLedger)

  // AI consent and online status (Story 24.1)
  const [aiConsentGranted, setAiConsentGranted] = useState(false)
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)

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

  // Allergy state — for ALLERGY_MATCH interaction checking
  const activeAllergies = useAllergyStore((s) => s.allergies)

  // Story 10.1: Medication history state for cross-encounter interaction checks
  const medicationHistoryAvailable = useEncounterStore((s) => s.medicationHistoryAvailable)
  const activeMedicationStatements = useEncounterStore((s) => s.activeMedicationStatements)
  const loadMedicationHistory = useEncounterStore((s) => s.loadMedicationHistory)

  // Prescription state
  const pendingPrescriptions = usePrescriptionStore((s) => s.pendingPrescriptions)
  const addPrescription = usePrescriptionStore((s) => s.addPrescription)
  const removePrescription = usePrescriptionStore((s) => s.removePrescription)
  const loadPrescriptions = usePrescriptionStore((s) => s.loadPrescriptions)
  const [prescriptionError, setPrescriptionError] = useState<string | null>(null)
  const [signingKey, setSigningKey] = useState<Uint8Array | null>(null)
  const [signingPublicKey, setSigningPublicKey] = useState<Uint8Array | null>(null)

  // Interaction check state
  const [interactionModal, setInteractionModal] = useState<{
    open: boolean
    interactions: InteractionResult[]
    pendingForm: PrescriptionFormData | null
    checkResult: InteractionCheckSummary | null
  }>({ open: false, interactions: [], pendingForm: null, checkResult: null })

  // Load signing key pair when encounter is active (RAM-only — never persisted)
  useEffect(() => {
    if (activeEncounter?.status === 'in-progress' && !signingKey) {
      getSigningKey().then((sk) => {
        setSigningKey(sk)
        setSigningPublicKey(getPublicKey())
      }).catch(() => {
        // Key generation failure is non-fatal; QR will show error on use
      })
    }
  }, [activeEncounter?.status, signingKey])

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
    // Story 10.1: Load medication history for cross-encounter interaction checks
    loadMedicationHistory(patientId)
  }, [activeEncounter?.id, activeEncounter?.status, initForEncounter, loadFromLedger, initVitalsForEncounter, loadVitals, loadPrescriptions, loadMedicationHistory, patientId])

  // Story 24.1: Online status tracking
  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Check for Tier 1 conflicts that block prescriptions
  useEffect(() => {
    let cancelled = false
    async function checkConflicts() {
      const blocked = await hasUnresolvedTier1Conflicts(patientId)
      if (!cancelled) setPrescriptionBlocked(blocked)
    }
    checkConflicts()
    const interval = setInterval(checkConflicts, 5_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [patientId])

  // Story 24.1: Check AI_PROCESSING consent when encounter loads
  useEffect(() => {
    if (!isActive || !patientId) return
    checkAIProcessingConsent(patientId).then(setAiConsentGranted).catch(() => setAiConsentGranted(false))
  }, [isActive, patientId])

  const handleSubjectiveChange = useCallback((value: string) => {
    setSubjective(value)
    triggerAutosave()
  }, [setSubjective, triggerAutosave])

  const handleObjectiveChange = useCallback((value: string) => {
    setObjective(value)
    triggerAutosave()
  }, [setObjective, triggerAutosave])

  const handleAssessmentChange = useCallback((value: string) => {
    setAssessment(value)
    triggerAutosave()
  }, [setAssessment, triggerAutosave])

  const handlePlanChange = useCallback((value: string) => {
    setSoapPlan(value)
    triggerAutosave()
  }, [setSoapPlan, triggerAutosave])

  const handleWeightChange = useCallback((v: string) => { setWeight(v); triggerVitalsAutosave() }, [setWeight, triggerVitalsAutosave])
  const handleHeightChange = useCallback((v: string) => { setHeight(v); triggerVitalsAutosave() }, [setHeight, triggerVitalsAutosave])
  const handleSystolicChange = useCallback((v: string) => { setSystolic(v); triggerVitalsAutosave() }, [setSystolic, triggerVitalsAutosave])
  const handleDiastolicChange = useCallback((v: string) => { setDiastolic(v); triggerVitalsAutosave() }, [setDiastolic, triggerVitalsAutosave])
  const handleTemperatureChange = useCallback((v: string) => { setTemperature(v); triggerVitalsAutosave() }, [setTemperature, triggerVitalsAutosave])

  const prescriptionCheckInFlight = useRef(false)

  const handleAddPrescription = useCallback(async (form: PrescriptionFormData) => {
    if (!activeEncounter || !practitionerRef) return
    if (prescriptionCheckInFlight.current) return  // guard against double-submit
    prescriptionCheckInFlight.current = true
    setPrescriptionError(null)

    // P2: Block prescription while allergy store is still loading
    const allergyLoading = useAllergyStore.getState().isLoading
    if (allergyLoading) {
      setPrescriptionError(tPrescription('errorAllergyLoading'))
      prescriptionCheckInFlight.current = false
      return
    }

    // P3: Treat allergy load error same as interaction check unavailable (CLAUDE.md Rule #3)
    const allergyLoadError = useAllergyStore.getState().loadError
    if (allergyLoadError) {
      setPrescriptionError(tPrescription('errorAllergyUnavailable'))
      try {
        const rx = await addPrescription(form, activeEncounter.id, patientId, practitionerRef, {
          interactionCheckResult: 'UNAVAILABLE',
        })
        try {
          await logInteractionCheck({
            encounterId: activeEncounter.id,
            patientId,
            medicationRequestId: rx.id,
            medicationDisplay: form.medicationDisplay,
            checkResult: 'UNAVAILABLE',
            interactionsFound: 0,
            practitionerRef: practitionerRef,
          })
        } catch {
          // Audit log failure must not block the prescription — log is best-effort locally
        }
      } catch (err) {
        setPrescriptionError(err instanceof Error ? err.message : tPrescription('errorSaveFailed'))
      }
      prescriptionCheckInFlight.current = false
      return
    }

    try {
      // Safety gate: check interactions against active meds
      const activeMedNames = pendingPrescriptions.map(
        (rx) => rx.medicationCodeableConcept.coding?.[0]?.display ?? '',
      ).filter(Boolean)

      let checkResult: InteractionCheckSummary
      try {
        checkResult = await checkInteractions(form.medicationDisplay, activeMedNames, {
          activeMedications: activeMedicationStatements,
          activeAllergies,
        })
      } catch {
        // CLAUDE.md safety rule #3: never default to "no interactions found" on failure
        setPrescriptionError(tPrescription('errorInteractionUnavailable'))
        try {
          const rx = await addPrescription(form, activeEncounter.id, patientId, practitionerRef, {
            interactionCheckResult: 'UNAVAILABLE',
          })
          await logInteractionCheck({
            encounterId: activeEncounter.id,
            patientId,
            medicationRequestId: rx.id,
            medicationDisplay: form.medicationDisplay,
            checkResult: 'UNAVAILABLE',
            interactionsFound: 0,
            practitionerRef: practitionerRef,
          })
        } catch (err) {
          setPrescriptionError(err instanceof Error ? err.message : tPrescription('errorSaveFailed'))
        }
        return
      }

      if (checkResult.result === 'BLOCKED') {
        // Show modal — require clinician override with justification
        setInteractionModal({
          open: true,
          interactions: checkResult.interactions,
          pendingForm: form,
          checkResult,
        })
        return
      }

      if (checkResult.result === 'UNAVAILABLE') {
        // CLAUDE.md safety rule #3: never default to "no interactions found"
        const staleMsg = checkResult.reason === 'DATABASE_STALE'
          ? tPrescription('errorDatabaseStale')
          : tPrescription('errorInteractionUnavailable')
        setPrescriptionError(staleMsg)
        try {
          const rx = await addPrescription(form, activeEncounter.id, patientId, practitionerRef, {
            interactionCheckResult: 'UNAVAILABLE',
          })
          try {
            await logInteractionCheck({
              encounterId: activeEncounter.id,
              patientId,
              medicationRequestId: rx.id,
              medicationDisplay: form.medicationDisplay,
              checkResult: 'UNAVAILABLE',
              interactionsFound: checkResult.interactions.length,
              practitionerRef: practitionerRef,
            })
          } catch {
            // Audit log failure must not block the prescription
          }
        } catch (err) {
          setPrescriptionError(err instanceof Error ? err.message : tPrescription('errorSaveFailed'))
        }
        prescriptionCheckInFlight.current = false
        return
      }

      // CLEAR or WARNING — proceed (warnings shown inline on the prescription)
      const interactionResult = checkResult.result === 'WARNING' ? 'WARNING' as const : 'CLEAR' as const
      try {
        const rx = await addPrescription(form, activeEncounter.id, patientId, practitionerRef, {
          interactionCheckResult: interactionResult,
        })
        try {
          await logInteractionCheck({
            encounterId: activeEncounter.id,
            patientId,
            medicationRequestId: rx.id,
            medicationDisplay: form.medicationDisplay,
            checkResult: interactionResult,
            interactionsFound: checkResult.interactions.length,
            practitionerRef: practitionerRef,
          })
        } catch {
          // Audit log failure must not block the prescription — log is best-effort locally
        }
      } catch (err) {
        setPrescriptionError(err instanceof Error ? err.message : tPrescription('errorSaveFailed'))
      }
    } finally {
      prescriptionCheckInFlight.current = false
    }
  }, [activeEncounter, addPrescription, patientId, practitionerRef, pendingPrescriptions, activeAllergies, activeMedicationStatements, prescriptionCheckInFlight])

  const handleInteractionOverride = useCallback(async (justification: string) => {
    if (!activeEncounter || !interactionModal.pendingForm) return
    const form = interactionModal.pendingForm
    const interactionCount = interactionModal.interactions.length
    setInteractionModal({ open: false, interactions: [], pendingForm: null, checkResult: null })
    try {
      const rx = await addPrescription(
        form,
        activeEncounter.id,
        patientId,
        practitionerRef,
        {
          interactionCheckResult: 'BLOCKED',
          interactionOverrideReason: justification,
        },
      )
      try {
        await logInteractionCheck({
          encounterId: activeEncounter.id,
          patientId,
          medicationRequestId: rx.id,
          medicationDisplay: form.medicationDisplay,
          checkResult: 'BLOCKED',
          interactionsFound: interactionCount,
          overrideReason: justification,
          practitionerRef: practitionerRef,
        })
      } catch {
        // Audit log failure must not block the prescription — log is best-effort locally
      }
    } catch (err) {
      setPrescriptionError(err instanceof Error ? err.message : tPrescription('errorSaveFailed'))
    }
  }, [activeEncounter, addPrescription, patientId, practitionerRef, interactionModal.pendingForm, interactionModal.interactions.length])

  const handleInteractionCancel = useCallback(() => {
    setInteractionModal({ open: false, interactions: [], pendingForm: null, checkResult: null })
  }, [])

  const handleRemovePrescription = useCallback(async (id: string) => {
    setPrescriptionError(null)
    try {
      await removePrescription(id)
    } catch (err) {
      setPrescriptionError(err instanceof Error ? err.message : tPrescription('errorCancelFailed'))
    }
  }, [removePrescription])

  const handleStartEncounter = useCallback(async () => {
    if (!practitionerRef) return
    await startEncounter(patientId, practitionerRef)
  }, [patientId, practitionerRef, startEncounter])

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
      <div className="mx-auto max-w-2xl flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 animate-spin text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
          </svg>
          <p className="font-semibold text-muted-foreground">{tEncounter('loadingPatient')}</p>
        </div>
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="mx-auto max-w-2xl flex flex-col gap-4">
        <p className="font-semibold text-muted-foreground">{tPatient('notFound')}</p>
        <Button
          variant="ghost"
          onClick={() => router.push('/')}
          className="mt-4"
        >
          {tNav('returnToSearch')}
        </Button>
      </div>
    )
  }

  return (
    <>
      {isActive && (
        <style>{`
          @keyframes sectionFadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .encounter-section {
            animation: sectionFadeIn 250ms ease-out forwards;
            opacity: 0;
          }
        `}</style>
      )}
      <div className="mx-auto max-w-2xl flex flex-col gap-4">
      {/* CLAUDE.md Rule #4: Allergy banner renders FIRST, in red, never collapsed */}
      <AllergyBanner patientId={patientId} />

      <ConflictBanner patientId={patientId} />

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <header className="mb-8">
        <Button
          variant="ghost"
          onClick={() => router.push('/')}
          className="mb-4"
          aria-label={tEncounter('backToSearch')}
        >
          {tNav('backToSearch')}
        </Button>
        <h1 className="text-3xl font-black tracking-tight text-foreground">
          {tEncounter('dashboard')}
        </h1>
      </header>

      <Card
        as="section"
        aria-label={tEncounter('patientInfo')}
      >
        <h2 className="text-xl font-bold text-foreground">
          {patient._ultranos?.nameLocal}
        </h2>
        {patient._ultranos?.nameLatin && (
          <p className="text-sm font-semibold text-muted-foreground">
            {patient._ultranos.nameLatin}
          </p>
        )}
        <div className="mt-3 flex gap-4 text-sm font-semibold text-muted-foreground">
          <span>ID: {patient.id.slice(0, 8)}...</span>
          <span>{patient.gender ?? tPatient('unknownGender')}</span>
          <span>{formatAge(patient.birthDate, patient.birthYearOnly, tPatient('unknownAge'))}</span>
        </div>
      </Card>

      {/* Encounter status + controls */}
      <Card
        as="section"
        className="mt-6"
        aria-label={tEncounter('statusAria')}
      >
        {isActive ? (
          <>
            <div className="flex items-center gap-3">
              <span
                className="inline-block h-3 w-3 rounded-full bg-success"
                aria-hidden="true"
              />
              <span className="text-lg font-bold text-success" role="status">
                {tEncounter('activeConsultation')}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {tEncounter('started', {
                time: activeEncounter.period.start
                  ? new Date(activeEncounter.period.start).toLocaleTimeString()
                  : tEncounter('startedUnknown')
              })}
            </p>
            <Button
              variant="secondary"
              onClick={handleEndEncounter}
              className="mt-4"
            >
              {tEncounter('endEncounter')}
            </Button>
          </>
        ) : (
          <>
            <p className="mb-4 font-semibold text-muted-foreground">
              {tEncounter('noActiveConsultation')}
            </p>
            <Button
              variant="primary"
              onClick={handleStartEncounter}
              disabled={isStarting || !isAuthenticated}
            >
              {isStarting ? tEncounter('starting') : tEncounter('startEncounter')}
            </Button>
          </>
        )}
      </Card>

      {/* Allergies — visible only during active encounter */}
      {isActive && (
        <Card
          as="section"
          className="encounter-section mt-6"
          style={{ animationDelay: '0ms' }}
          aria-label={tAllergy('title')}
          data-section="allergies"
          tabIndex={-1}
        >
          <AllergyEntry patientId={patientId} />
        </Card>
      )}

      {/* Vital Signs — visible only during active encounter */}
      {isActive && (
        <Card
          as="section"
          className="encounter-section mt-6"
          style={{ animationDelay: '50ms' }}
          aria-label={tEncounter('vitalSigns')}
          data-section="vitals"
          tabIndex={-1}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">{tEncounter('vitalSigns')}</h2>
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
        </Card>
      )}

      {/* SOAP Note Entry — visible only during active encounter */}
      {isActive && (
        <Card
          as="section"
          className="encounter-section mt-6"
          style={{ animationDelay: '100ms' }}
          aria-label={tEncounter('soapNotes')}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">{tSoap('clinicalNotes')}</h2>
            <AutosaveIndicator status={autosaveStatus} />
          </div>
          <SOAPNoteEntry
            subjective={subjective}
            objective={objective}
            assessment={assessment}
            plan={soapPlan}
            onSubjectiveChange={handleSubjectiveChange}
            onObjectiveChange={handleObjectiveChange}
            onAssessmentChange={handleAssessmentChange}
            onPlanChange={handlePlanChange}
            encounterId={activeEncounter?.id ?? ''}
            patientId={patientId}
            aiConsentGranted={aiConsentGranted}
            isOnline={isOnline}
          />
        </Card>
      )}

      {/* Prescriptions — visible only during active encounter */}
      {isActive && (
        <Card
          as="section"
          className="encounter-section mt-6"
          style={{ animationDelay: '150ms' }}
          aria-label={tEncounter('prescriptions')}
          data-section="prescriptions"
          tabIndex={-1}
        >
          {/* Story 10.1 AC 9: Medication history unavailable warning */}
          {!medicationHistoryAvailable && (
            <div
              className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3"
              role="alert"
            >
              <p className="text-sm font-bold text-foreground">
                {tPrescription('medicationHistoryUnavailable')}
              </p>
              <p className="text-xs text-muted-foreground">
                {tPrescription('medicationHistoryDetail')}
              </p>
            </div>
          )}

          {/* Drug interaction check status */}
          {pendingPrescriptions.some((rx) => rx._ultranos.interactionCheckResult === 'UNAVAILABLE') ? (
            <div
              className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3"
              role="alert"
            >
              <p className="text-sm font-bold text-foreground">
                {tPrescription('interactionCheckPartial')}
              </p>
              <p className="text-xs text-muted-foreground">
                {tPrescription('interactionCheckPartialDetail')}
              </p>
            </div>
          ) : (
            <div
              className="mb-4 rounded-lg border border-success/30 bg-success/10 px-4 py-3"
              role="status"
            >
              <p className="text-sm font-bold text-foreground">
                {tPrescription('interactionCheckActive')}
              </p>
              <p className="text-xs text-muted-foreground">
                {tPrescription('interactionCheckActiveDetail', { medCount: activeMedicationStatements.length, allergyCount: activeAllergies.length })}
              </p>
            </div>
          )}

          <InteractionWarningModal
            open={interactionModal.open}
            interactions={interactionModal.interactions}
            onCancel={handleInteractionCancel}
            onOverride={handleInteractionOverride}
          />

          {prescriptionBlocked && (
            <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3" role="alert">
              <p className="text-sm font-semibold text-destructive">
                {tPrescription('prescriptionBlocked')}
              </p>
            </div>
          )}

          <PrescriptionEntry onSubmit={handleAddPrescription} />

          {prescriptionError && (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3" role="alert">
              <p className="text-sm font-semibold text-destructive">{prescriptionError}</p>
            </div>
          )}

          {/* Pending prescriptions list */}
          {pendingPrescriptions.length > 0 && (
            <div className="mt-6 space-y-3">
              <h4 className="text-sm font-bold text-foreground">
                {tPrescription('pendingTitle', { count: pendingPrescriptions.length })}
              </h4>
              <ul className="space-y-2" aria-label={tPrescription('pendingTitle', { count: pendingPrescriptions.length })}>
                {pendingPrescriptions.map((rx) => (
                  <li
                    key={rx.id}
                    className="flex items-center justify-between rounded-xl ring-[0.65px] ring-border/50 bg-card px-4 py-3"
                  >
                    <div>
                      <span className="font-semibold text-foreground">
                        {rx.medicationCodeableConcept.text}
                      </span>
                      <span className="ms-2 me-2 text-border">|</span>
                      <span className="text-sm text-muted-foreground">
                        {rx.dosageInstruction?.[0]?.text}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {rx._ultranos.interactionCheckResult === 'WARNING' && (
                        <span className="rounded-full bg-warning/20 px-3 py-1 text-xs font-bold text-foreground">
                          {tPrescription('interactionWarning')}
                        </span>
                      )}
                      {rx._ultranos.interactionCheckResult === 'BLOCKED' && (
                        <span className="rounded-full bg-destructive/20 px-3 py-1 text-xs font-bold text-destructive" title={rx._ultranos.interactionOverrideReason}>
                          {tPrescription('interactionOverride')}
                        </span>
                      )}
                      {rx._ultranos.interactionCheckResult === 'CLEAR' && (
                        <span className="rounded-full bg-success/20 px-3 py-1 text-xs font-bold text-success">
                          {tPrescription('interactionClear')}
                        </span>
                      )}
                      {rx._ultranos.interactionCheckResult === 'UNAVAILABLE' && (
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                          {tPrescription('interactionUnchecked')}
                        </span>
                      )}
                      <span className="rounded-full bg-warning/20 px-3 py-1 text-xs font-bold text-foreground">
                        {tPrescription('pendingFulfillment')}
                      </span>
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={() => handleRemovePrescription(rx.id)}
                        className="!text-destructive"
                        aria-label={tPrescription('cancelAria', { medication: rx.medicationCodeableConcept.text })}
                      >
                        {tPrescription('cancel')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>

              {/* QR Code Generation — available when prescriptions exist and key is loaded */}
              {signingKey && signingPublicKey && (
                <div className="mt-6 border-t border-border pt-6">
                  <h4 className="mb-3 text-sm font-bold text-foreground">
                    {tPrescription('digitalPrescription')}
                  </h4>
                  <PrescriptionQR
                    prescriptions={pendingPrescriptions}
                    privateKey={signingKey}
                    publicKey={signingPublicKey}
                    onFinalized={() => {
                      auditPhiAccess(
                        AuditAction.EXPORT,
                        AuditResourceType.PRESCRIPTION,
                        activeEncounter?.id ?? 'unknown',
                        selectedPatient?.id,
                        { phiAccess: 'qr_generation', prescriptionCount: pendingPrescriptions.length },
                      )
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </Card>
      )}

    </div>
    </>
  )
}
