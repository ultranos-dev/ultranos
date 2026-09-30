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
import { loadPatientResilient } from '@/lib/patient-loader'
import { useRouter } from 'next/navigation'
import type { FhirPatient } from '@ultranos/shared-types'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { useCommandPalette } from '@/hooks/use-command-palette'
import { usePrescriptionStore } from '@/stores/prescription-store'
import { PrescriptionEntry } from '@/components/clinical/PrescriptionEntry'
import { PharmacyPicker } from '@/components/clinical/PharmacyPicker'
import { LabOrderEntry } from '@/components/clinical/LabOrderEntry'
import type { PrescriptionFormData } from '@/lib/prescription-config'
import { readBrandFromCoding, readPerformerFromDispenseRequest } from '@/lib/medication-request-mapper'
import { useTranslations, useLocale } from 'next-intl'
import { formatTime } from '@ultranos/ui-kit'
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
import { Alert } from '@ultranos/ui-kit/components/ui/alert'
import { Avatar } from '@ultranos/ui-kit/components/ui/avatar'
import { AlertTriangle, ChevronDown, Pill } from '@ultranos/ui-kit/icons'
import { getPatientPhotoUrl } from '@/lib/patient-photo-api'

interface EncounterDashboardProps {
  patientId: string
}

// Command-island layout: the four workflow sections are tabs (one open at a time).
// Allergies are deliberately NOT a tab — they render in the island's always-red
// strip (Rule #4) and are edited via a peek drawer.
type SectionKey = 'vitals' | 'soap' | 'prescriptions' | 'labs'

// Shared shapes so the island, its drawers, and the work panels all read as one
// rounded, bordered system (matches the approved mockup).
const ISLAND_CLASS =
  'sticky top-[4.5rem] z-20 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_6px_24px_-12px_rgba(0,0,0,0.18)]'
const PANEL_CLASS = 'rounded-2xl border border-border bg-card p-5 shadow-card'

/** Work-panel header: title + optional right-aligned control (e.g. autosave). */
function PanelHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      {right}
    </div>
  )
}

// Resolve age from an exact birthDate when present, else fall back to the
// year-only `birthYear` (the common case for this population — the patient
// schema makes birthDate and birthYearOnly mutually exclusive, so year-only
// records carry no birthDate). Mirrors PatientHeaderCard.computeAge.
function ageYears(birthDate?: string, birthYear?: number): number | undefined {
  if (birthDate) {
    const b = new Date(birthDate)
    if (!Number.isNaN(b.getTime())) {
      const now = new Date()
      let age = now.getFullYear() - b.getFullYear()
      const m = now.getMonth() - b.getMonth()
      if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
      return age
    }
  }
  if (birthYear) {
    return new Date().getFullYear() - birthYear
  }
  return undefined
}

function formatAge(birthDate?: string, birthYear?: number, unknownLabel = 'Unknown age'): string {
  const age = ageYears(birthDate, birthYear)
  return age == null ? unknownLabel : `${age}y`
}

// Patronymic name chain in entry order: patient's name (given + family),
// father, grandfather — mirrors NameInputSection's Display Name preview so the
// encounter header reads identically to the Edit Patient Profile modal.
function patientNameSegments(ext?: FhirPatient['_ultranos']): string[] {
  if (!ext) return []
  return [
    [ext.nameGiven, ext.nameFamily].filter(Boolean).join(' '),
    ext.nameFather,
    ext.nameGrandfather,
  ].filter((s): s is string => !!s && s.trim().length > 0)
}

export function EncounterDashboard({ patientId }: EncounterDashboardProps) {
  const tPatient = useTranslations('patient')
  const tPrescription = useTranslations('prescription')
  const tEncounter = useTranslations('encounter')
  const tNav = useTranslations('nav')
  const tSoap = useTranslations('soap')
  const locale = useLocale() as 'en' | 'ar' | 'prs' | 'ps'
  // Canonical FHIR reference. Encounters (participant) and prescriptions
  // (requester) are stored verbatim, and the Hub scopes encounter.listByPractitioner
  // on "Practitioner/<id>" — a bare id silently drops the practitioner's whole
  // queue from the dashboard on login. Empty stays empty so the guards below hold.
  const practitionerRef = useAuthSessionStore((s) =>
    s.session?.practitionerId ? `Practitioner/${s.session.practitionerId}` : '',
  )
  // Identity alias: encounters created before the custom-access-token-hook (migration
  // 056) carry `Practitioner/<auth_user_id>` (the auth `sub`) instead of practitioners.id.
  // Pass it so the dashboard adopts those pre-hook encounters instead of stranding their
  // notes/vitals and starting an empty duplicate. Empty when it equals the canonical ref.
  const altPractitionerRef = useAuthSessionStore((s) =>
    s.session?.userId && s.session.userId !== s.session.practitionerId
      ? `Practitioner/${s.session.userId}`
      : '',
  )
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const router = useRouter()
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette()
  const selectedPatient = usePatientStore((s) => s.selectedPatient)
  const [dexiePatient, setDexiePatient] = useState<FhirPatient | null>(null)
  const [loading, setLoading] = useState(false)
  const [needsReauth, setNeedsReauth] = useState(false)
  // Patient photo (signed URL, opaque key resolved server-side) — shown in the
  // header and rail; falls back to initials on miss/offline.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  const { isSyncing } = usePatientSync(patientId)
  const [prescriptionBlocked, setPrescriptionBlocked] = useState(false)

  // Shallow selectors to prevent unnecessary re-renders (perf guardrail)
  const activeEncounter = useEncounterStore((s) => s.activeEncounter)
  const isStarting = useEncounterStore((s) => s.isStarting)
  const startEncounter = useEncounterStore((s) => s.startEncounter)
  const endEncounter = useEncounterStore((s) => s.endEncounter)
  const loadActiveEncounter = useEncounterStore((s) => s.loadActiveEncounter)
  const isActive = activeEncounter?.status === 'in-progress'

  // Command island: the four work sections are tabs (one open at a time); SOAP is
  // the default. Reference info (allergies, active meds) opens as peek drawers that
  // drop out of the island, so they can overlay whatever work tab you're on.
  const [activeSection, setActiveSection] = useState<SectionKey>('soap')
  const [openDrawer, setOpenDrawer] = useState<'allergies' | 'meds' | null>(null)
  const toggleDrawer = useCallback((d: 'allergies' | 'meds') => {
    setOpenDrawer((cur) => (cur === d ? null : d))
  }, [])

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
  const soapDecryptFailed = useSoapNoteStore((s) => s.decryptFailed)
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
  const applyPharmacyToPending = usePrescriptionStore((s) => s.applyPharmacyToPending)
  const prescriptionLoadError = usePrescriptionStore((s) => s.loadError)
  const [prescriptionError, setPrescriptionError] = useState<string | null>(null)
  // One preferred pharmacy for the whole prescription (not per medication).
  const [prescriptionPharmacy, setPrescriptionPharmacy] = useState<{ id: string; name?: string } | undefined>(undefined)
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

  // Load patient on page refresh / direct nav (e.g. "Start New Encounter").
  // Offline-first: read local Dexie, then fall back to the Hub when the
  // patient isn't in IndexedDB (the Patient sync pull does not deliver the
  // demographic record to every client). Shared with the patient chart page.
  useEffect(() => {
    if (selectedPatient && selectedPatient.id === patientId) return
    let cancelled = false
    setLoading(true)
    setNeedsReauth(false)
    loadPatientResilient(patientId)
      .then(({ patient, needsReauth: reauth }) => {
        if (cancelled) return
        if (reauth) {
          setNeedsReauth(true)
        } else if (patient) {
          setDexiePatient(patient)
          usePatientStore.getState().selectPatient(patient)
        }
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [patientId, selectedPatient])

  // Patient photo — signed URL by id (Hub resolves the opaque key); null on miss.
  useEffect(() => {
    if (!patientId) { setPhotoUrl(null); return }
    let cancelled = false
    const controller = new AbortController()
    ;(async () => {
      const url = await getPatientPhotoUrl(patientId, controller.signal)
      if (!cancelled) setPhotoUrl(url ?? null)
    })()
    return () => { cancelled = true; controller.abort() }
  }, [patientId])

  // Load any active encounter for this patient + practitioner from Dexie.
  useEffect(() => {
    loadActiveEncounter(patientId, practitionerRef || undefined, altPractitionerRef ? [altPractitionerRef] : undefined)
  }, [patientId, practitionerRef, altPractitionerRef, loadActiveEncounter])

  // Re-check after a sync pull completes: login/chart hydration may bring a
  // still-open encounter (started in another session/device) into the local
  // cache AFTER the initial mount read. Without this re-run, the dashboard would
  // keep showing "Start" and let the clinician open a duplicate.
  const prevSyncingRef = useRef(false)
  useEffect(() => {
    if (prevSyncingRef.current && !isSyncing) {
      loadActiveEncounter(patientId, practitionerRef || undefined, altPractitionerRef ? [altPractitionerRef] : undefined)
    }
    prevSyncingRef.current = isSyncing
  }, [isSyncing, patientId, practitionerRef, altPractitionerRef, loadActiveEncounter])

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

  // Initialise the section pharmacy from persisted prescriptions ONCE on (re)load.
  // The ref guards against re-running after a user select/clear (which would
  // otherwise revert a clear from stale pending state before the update lands).
  const pharmacyInitRef = useRef(false)
  useEffect(() => {
    if (pharmacyInitRef.current || pendingPrescriptions.length === 0) return
    pharmacyInitRef.current = true
    const { pharmacyId, pharmacyName } = readPerformerFromDispenseRequest(pendingPrescriptions[0]!)
    if (pharmacyId) setPrescriptionPharmacy({ id: pharmacyId, name: pharmacyName })
  }, [pendingPrescriptions])

  const handleSelectPharmacy = useCallback((id: string, name: string) => {
    pharmacyInitRef.current = true
    setPrescriptionPharmacy({ id, name })
    void applyPharmacyToPending({ id, name })
  }, [applyPharmacyToPending])

  const handleClearPharmacy = useCallback(() => {
    pharmacyInitRef.current = true
    setPrescriptionPharmacy(undefined)
    void applyPharmacyToPending(null)
  }, [applyPharmacyToPending])

  const handleAddPrescription = useCallback(async (form: PrescriptionFormData) => {
    // The pharmacy is selected once for the whole prescription; stamp it onto
    // each medication as it is added.
    form = { ...form, pharmacyId: prescriptionPharmacy?.id, pharmacyName: prescriptionPharmacy?.name }
    if (!activeEncounter || !practitionerRef) return
    // Tier-1 safety gate (defense-in-depth): the form is disabled while blocked,
    // but a command-palette / keyboard path could still reach here. Never generate
    // a prescription while an unresolved Tier-1 conflict stands (CLAUDE.md rule 5).
    if (prescriptionBlocked) {
      setPrescriptionError(tPrescription('prescriptionBlocked'))
      return
    }
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
  }, [activeEncounter, addPrescription, patientId, practitionerRef, pendingPrescriptions, activeAllergies, activeMedicationStatements, prescriptionCheckInFlight, prescriptionBlocked, tPrescription, prescriptionPharmacy])

  const handleInteractionOverride = useCallback(async (justification: string) => {
    if (!activeEncounter || !interactionModal.pendingForm) return
    const form = { ...interactionModal.pendingForm, pharmacyId: prescriptionPharmacy?.id, pharmacyName: prescriptionPharmacy?.name }
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
  }, [activeEncounter, addPrescription, patientId, practitionerRef, interactionModal.pendingForm, interactionModal.interactions.length, prescriptionPharmacy])

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
    await startEncounter(patientId, practitionerRef, altPractitionerRef ? [altPractitionerRef] : undefined)
  }, [patientId, practitionerRef, altPractitionerRef, startEncounter])

  const handleEndEncounter = useCallback(async () => {
    flushAutosave()
    flushVitalsAutosave()
    await endEncounter()
  }, [endEncounter, flushAutosave, flushVitalsAutosave])

  const patient = (selectedPatient?.id === patientId ? selectedPatient : null) ?? dexiePatient
  const nameSegments = patient ? patientNameSegments(patient._ultranos) : []

  // Island identity display name (patronymic chain, or local name fallback).
  const islandDisplayName =
    nameSegments.length > 0
      ? nameSegments.join(' · ')
      : (patient?._ultranos?.nameLocal ?? '')
  const patientPhone = patient?.telecom?.find((tc) => tc.system === 'phone')?.value

  // MedicationStatement.medicationCodeableConcept is CodeableConcept: prefer text.
  // Also include any pending prescriptions from the current encounter session.
  // Feeds the island's "Active meds" peek drawer.
  const railActiveMeds = [
    ...activeMedicationStatements.map(
      (s) => s.medicationCodeableConcept?.text ?? s.medicationCodeableConcept?.coding?.[0]?.display ?? '',
    ),
    ...pendingPrescriptions.map(
      (rx) => rx.medicationCodeableConcept.text ?? rx.medicationCodeableConcept.coding?.[0]?.display ?? '',
    ),
  ].filter(Boolean)

  // --- Encounter A: collapsed-section summaries + sticky-nav interaction pill ---
  const anyInteractionUnavailable = pendingPrescriptions.some(
    (rx) => rx._ultranos.interactionCheckResult === 'UNAVAILABLE',
  )
  const sectionNav: { key: SectionKey; label: string }[] = [
    { key: 'vitals', label: tEncounter('vitalSigns') },
    { key: 'soap', label: tSoap('clinicalNotes') },
    { key: 'labs', label: tEncounter('labsTab') },
    { key: 'prescriptions', label: tEncounter('prescriptions') },
  ]

  // Reset palette state when entering/exiting loading to prevent desync
  useEffect(() => {
    if (loading) setPaletteOpen(false)
  }, [loading, setPaletteOpen])

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
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

  if (needsReauth) {
    return (
      <div className="flex flex-col gap-4">
        <p className="font-semibold text-muted-foreground">
          {tPatient('reauthRequired')}
        </p>
        <Button
          variant="primary"
          onClick={() => {
            const returnUrl = encodeURIComponent(window.location.pathname)
            window.location.href = `/login?returnUrl=${returnUrl}`
          }}
          className="mt-4"
        >
          {tPatient('signIn')}
        </Button>
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="flex flex-col gap-4">
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
    <div className="flex flex-1 flex-col gap-4">
      <ConflictBanner patientId={patientId} />
      {/* Title and back navigation are provided by the shell's BreadcrumbHeader. */}

      {/* Pre-encounter: identity + Start action (no island until active). */}
      {!isActive && (
        <>
          <AllergyBanner patientId={patientId} />
          <Card as="section" aria-label={tEncounter('patientInfo')}>
            <div className="flex items-start gap-4">
              <Avatar src={photoUrl} name={islandDisplayName} size={56} />
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold text-foreground leading-snug" dir="auto">
                  {nameSegments.length > 0
                    ? nameSegments.map((name, i) => (
                        <span key={i}>
                          {i > 0 && (
                            <span className="mx-1.5 text-muted-foreground" aria-hidden="true">&middot;</span>
                          )}
                          {name}
                        </span>
                      ))
                    : patient._ultranos?.nameLocal}
                </h2>
                {patient._ultranos?.nameLatin && (
                  <p className="text-sm font-semibold text-muted-foreground">
                    {patient._ultranos.nameLatin}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold text-muted-foreground">
                  <span>ID: {patient.id.slice(0, 8)}...</span>
                  <span>{patient.gender ?? tPatient('unknownGender')}</span>
                  <span>{formatAge(patient.birthDate, patient._ultranos?.birthYear, tPatient('unknownAge'))}</span>
                </div>
              </div>
            </div>
          </Card>
          <Card as="section" aria-label={tEncounter('statusAria')}>
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
          </Card>
        </>
      )}

      {/* Active encounter: the sticky command island carries all patient context. */}
      {isActive && (
        <section className={ISLAND_CLASS} aria-label={tEncounter('patientInfo')}>
          {/* Allergy strip — always red, always first, never a tab (Rule #4). */}
          <AllergyBanner
            patientId={patientId}
            className="!mb-0 !rounded-none !shadow-none !ring-0 border-b border-border"
          />

          {/* Identity + live status */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <Avatar src={photoUrl} name={islandDisplayName} size={44} />
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-foreground" dir="auto">
                {islandDisplayName}
              </h2>
              <p className="truncate text-xs font-medium text-muted-foreground tabular-nums">
                {[
                  patient.gender ?? tPatient('unknownGender'),
                  formatAge(patient.birthDate, patient._ultranos?.birthYear, tPatient('unknownAge')),
                  patientPhone,
                  `ID …${patient.id.slice(0, 8)}`,
                  patient._ultranos?.bloodGroup ? `${tEncounter('bloodShort')} ${patient._ultranos.bloodGroup}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <div className="ms-auto flex items-center gap-3">
              <span
                role="status"
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  anyInteractionUnavailable ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'
                }`}
              >
                {anyInteractionUnavailable ? (
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <span className="inline-block h-2 w-2 rounded-full bg-success" aria-hidden="true" />
                )}
                {anyInteractionUnavailable ? tEncounter('interactionUnavailable') : tEncounter('interactionActive')}
              </span>
              <span className="hidden items-center gap-1.5 text-xs font-semibold text-primary sm:inline-flex">
                <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                <span>{tEncounter('activeConsultation')}</span>
                {activeEncounter?.period?.start && (
                  <span className="tabular-nums" data-testid="encounter-start-time">
                    · {formatTime(activeEncounter.period.start, locale)}
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Work tabs + reference peek triggers */}
          <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
            <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label={tEncounter('sectionNavLabel')}>
              {sectionNav.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={activeSection === s.key}
                  onClick={() => setActiveSection(s.key)}
                  className={`flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
                    activeSection === s.key
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {s.label}
                  {s.key === 'prescriptions' && pendingPrescriptions.length > 0 && (
                    <span
                      className={`rounded-full px-1.5 text-xs font-bold ${
                        activeSection === 'prescriptions'
                          ? 'bg-primary-foreground/25 text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {pendingPrescriptions.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="ms-auto flex items-center gap-2">
              <button
                type="button"
                aria-expanded={openDrawer === 'allergies'}
                onClick={() => toggleDrawer('allergies')}
                className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors ${
                  openDrawer === 'allergies'
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'border-border text-foreground hover:bg-muted'
                }`}
              >
                {tEncounter('manageAllergies')}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${openDrawer === 'allergies' ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                aria-expanded={openDrawer === 'meds'}
                onClick={() => toggleDrawer('meds')}
                className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors ${
                  openDrawer === 'meds'
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'border-border text-foreground hover:bg-muted'
                }`}
              >
                <Pill className="h-3.5 w-3.5" aria-hidden="true" />
                {tEncounter('railActiveMeds')}
                {railActiveMeds.length > 0 && (
                  <span
                    className={`rounded-full px-1.5 text-xs font-bold ${
                      openDrawer === 'meds'
                        ? 'bg-primary-foreground/25 text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {railActiveMeds.length}
                  </span>
                )}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${openDrawer === 'meds' ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          {/* Peek drawers — drop out of the island, overlaying whatever tab is open. */}
          {openDrawer === 'allergies' && (
            <div className="max-h-[50vh] overflow-y-auto border-t border-border bg-muted/40 px-4 py-4">
              <AllergyEntry patientId={patientId} />
            </div>
          )}
          {openDrawer === 'meds' && (
            <div className="max-h-[50vh] overflow-y-auto border-t border-border bg-muted/40 px-4 py-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {tEncounter('railActiveMeds')}
              </h4>
              {railActiveMeds.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tEncounter('railNoneRecorded')}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border text-sm text-foreground">
                  {railActiveMeds.map((med) => (
                    <li key={med} className="py-2">
                      {med}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {/* Interaction override modal — mounted at root so a BLOCKED result always
          surfaces regardless of the active tab (Rule #3). */}
      {isActive && (
        <InteractionWarningModal
          open={interactionModal.open}
          interactions={interactionModal.interactions}
          onCancel={handleInteractionCancel}
          onOverride={handleInteractionOverride}
        />
      )}

      {/* Vital Signs tab panel */}
      {isActive && (
        <div
          className={PANEL_CLASS}
          role="tabpanel"
          aria-label={tEncounter('vitalSigns')}
          data-section="vitals"
          tabIndex={-1}
          hidden={activeSection !== 'vitals'}
        >
          <PanelHeader title={tEncounter('vitalSigns')} right={<AutosaveIndicator status={vitalsAutosaveStatus} />} />
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
        </div>
      )}

      {/* Clinical Notes (SOAP) tab panel */}
      {isActive && (
        <div
          className={PANEL_CLASS}
          role="tabpanel"
          aria-label={tEncounter('soapNotes')}
          data-section="soap"
          tabIndex={-1}
          hidden={activeSection !== 'soap'}
        >
          <PanelHeader title={tSoap('clinicalNotes')} right={<AutosaveIndicator status={autosaveStatus} />} />
          {soapDecryptFailed && (
            <Alert variant="warning" role="alert" className="mb-3" icon={<AlertTriangle className="h-4 w-4" />}>
              <p className="text-sm font-semibold text-foreground">{tSoap('decryptFailedTitle')}</p>
              <p className="text-xs text-muted-foreground">{tSoap('decryptFailedBody')}</p>
            </Alert>
          )}
          <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            {tEncounter('reviewAiNote')}
          </p>
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
        </div>
      )}

      {/* Prescriptions tab panel */}
      {isActive && (
        <div
          className={PANEL_CLASS}
          role="tabpanel"
          aria-label={tEncounter('prescriptions')}
          data-section="prescriptions"
          tabIndex={-1}
          hidden={activeSection !== 'prescriptions'}
        >
          <PanelHeader title={tEncounter('prescriptions')} />

          {/* Active-meds reference at prescribe time (also available as the island
              peek drawer). Keeps current meds visible while writing a prescription. */}
          {railActiveMeds.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-wide">{tEncounter('railActiveMeds')}:</span>
              {railActiveMeds.map((med) => (
                <span key={med} className="rounded-full border border-border bg-card px-2.5 py-0.5 font-semibold text-foreground">
                  {med}
                </span>
              ))}
            </div>
          )}
          {/* Story 10.1 AC 9: Medication history unavailable warning */}
          {!medicationHistoryAvailable && (
            <Alert variant="warning" role="alert" className="mb-4">
              <p className="text-sm font-bold text-foreground">
                {tPrescription('medicationHistoryUnavailable')}
              </p>
              <p className="text-xs text-muted-foreground">
                {tPrescription('medicationHistoryDetail')}
              </p>
            </Alert>
          )}

          {/* Drug interaction check status */}
          {pendingPrescriptions.some((rx) => rx._ultranos.interactionCheckResult === 'UNAVAILABLE') ? (
            <Alert variant="warning" role="alert" className="mb-4">
              <p className="text-sm font-bold text-foreground">
                {tPrescription('interactionCheckPartial')}
              </p>
              <p className="text-xs text-muted-foreground">
                {tPrescription('interactionCheckPartialDetail')}
              </p>
            </Alert>
          ) : (
            <Alert variant="success" role="status" className="mb-4">
              <p className="text-sm font-bold text-foreground">
                {tPrescription('interactionCheckActive')}
              </p>
              <p className="text-xs text-muted-foreground">
                {tPrescription('interactionCheckActiveDetail', { medCount: activeMedicationStatements.length, allergyCount: activeAllergies.length })}
              </p>
            </Alert>
          )}

          {prescriptionBlocked && (
            <Alert variant="destructive" role="alert" className="mb-4" icon={<AlertTriangle className="h-4 w-4" />}>
              <p className="text-sm font-semibold text-destructive">
                {tPrescription('prescriptionBlocked')}
              </p>
            </Alert>
          )}

          {/* One preferred pharmacy for the entire prescription (optional). */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-semibold text-foreground">{tPrescription('pharmacyOptional')}</label>
            <PharmacyPicker
              value={prescriptionPharmacy?.id}
              name={prescriptionPharmacy?.name}
              onSelect={handleSelectPharmacy}
              onClear={handleClearPharmacy}
            />
          </div>

          <PrescriptionEntry
            onSubmit={handleAddPrescription}
            disabled={prescriptionBlocked}
            patientSex={patient.gender}
            patientAge={ageYears(patient.birthDate, patient._ultranos?.birthYear)}
          />

          {prescriptionError && (
            <Alert variant="destructive" role="alert" className="mt-3" icon={<AlertTriangle className="h-4 w-4" />}>
              <p className="text-sm font-semibold text-destructive">{prescriptionError}</p>
            </Alert>
          )}

          {/* PHI safety: prescription load failure must be visible, never a false empty.
              This alert replaces the silent empty list when Dexie is unavailable. */}
          {prescriptionLoadError && (
            <Alert variant="warning" role="alert" className="mt-3" data-testid="prescription-load-error">
              <p className="text-sm font-semibold">{tPrescription('loadUnavailable')}</p>
            </Alert>
          )}

          {/* Pending prescriptions list */}
          {pendingPrescriptions.length > 0 && (
            <div className="mt-6 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">
                {tPrescription('pendingTitle', { count: pendingPrescriptions.length })}
              </h4>
              <ul className="divide-y divide-border" aria-label={tPrescription('pendingTitle', { count: pendingPrescriptions.length })}>
                {pendingPrescriptions.map((rx) => {
                  const { brand, manufacturer } = readBrandFromCoding(rx.medicationCodeableConcept.coding)
                  const brandLabel = brand
                    ? manufacturer ? `${brand} (${manufacturer})` : brand
                    : undefined
                  return (
                  <li
                    key={rx.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <span className="font-semibold text-foreground">
                        {rx.medicationCodeableConcept.text}
                      </span>
                      {brandLabel && (
                        <span className="ms-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {brandLabel}
                        </span>
                      )}
                      <span className="mx-2 text-muted-foreground" aria-hidden="true">&middot;</span>
                      <span className="text-sm text-muted-foreground">
                        {rx.dosageInstruction?.[0]?.text}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {rx._ultranos.interactionCheckResult === 'WARNING' && (
                        <span className="rounded-full bg-warning/20 px-3 py-1 text-xs font-semibold text-foreground">
                          {tPrescription('interactionWarning')}
                        </span>
                      )}
                      {rx._ultranos.interactionCheckResult === 'BLOCKED' && (
                        <span className="rounded-full bg-destructive/20 px-3 py-1 text-xs font-semibold text-destructive" title={rx._ultranos.interactionOverrideReason}>
                          {tPrescription('interactionOverride')}
                        </span>
                      )}
                      {rx._ultranos.interactionCheckResult === 'CLEAR' && (
                        <span className="rounded-full bg-success/20 px-3 py-1 text-xs font-semibold text-success">
                          {tPrescription('interactionClear')}
                        </span>
                      )}
                      {rx._ultranos.interactionCheckResult === 'UNAVAILABLE' && (
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                          {tPrescription('interactionUnchecked')}
                        </span>
                      )}
                      <span className="rounded-full bg-warning/20 px-3 py-1 text-xs font-semibold text-foreground">
                        {tPrescription('pendingFulfillment')}
                      </span>
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={() => handleRemovePrescription(rx.id)}
                        className="!text-destructive"
                        aria-label={tPrescription('cancelAria', { medication: rx.medicationCodeableConcept.text ?? '' })}
                      >
                        {tPrescription('cancel')}
                      </Button>
                    </div>
                  </li>
                  )
                })}
              </ul>

              {/* QR Code Generation — available when prescriptions exist and key is loaded */}
              {signingKey && signingPublicKey && (
                <div className="mt-6 border-t border-border pt-6">
                  <h4 className="mb-3 text-sm font-semibold text-foreground">
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
          </div>
      )}

      {/* Lab orders tab panel */}
      {isActive && (
        <div
          className={PANEL_CLASS}
          role="tabpanel"
          aria-label={tEncounter('labsTab')}
          data-section="lab-orders"
          tabIndex={-1}
          hidden={activeSection !== 'labs'}
        >
          <PanelHeader title={tEncounter('labsTab')} />
          <LabOrderEntry
            encounterId={activeEncounter.id}
            patientId={patientId}
            practitionerRef={practitionerRef}
          />
        </div>
      )}

      {/* Review & sign — the end-of-flow close action. Entries autosave; ending
          the encounter is the deliberate sign-off that closes the consultation. */}
      {isActive && (
        <div className={PANEL_CLASS} role="group" aria-label={tEncounter('reviewSignTitle')}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-foreground">{tEncounter('reviewSignTitle')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isOnline ? tEncounter('signOffHint') : tEncounter('signOffHintOffline')}
              </p>
            </div>
            <Button variant="primary" onClick={handleEndEncounter} className="shrink-0">
              {tEncounter('endEncounter')}
            </Button>
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
