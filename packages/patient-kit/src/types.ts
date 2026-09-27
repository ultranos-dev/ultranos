/**
 * @ultranos/patient-kit — core contracts (v1)
 *
 * The seam that lets ONE shared patient form/detail UI serve every spoke (OPD-Lite,
 * Pharmacy-Lite, Lab-Lite) without duplicating the form four times. Two ideas:
 *
 *   1. PatientFormValues — a normalized, app-agnostic field model the shared form owns.
 *   2. PatientDataAdapter — the injected data layer. Each app supplies its own offline
 *      primitive + Hub calls; the shared form never imports app `@/lib/*` code directly.
 *
 * What each app SEES/does is governed by PatientFormCapabilities (derived from the Hub
 * access policy — see capabilities.ts), NOT by per-app conditionals inside the form.
 *
 * NOTE (v1 planning): these types are the reviewed contract for Phase 1. Field-level
 * details may be refined as the opd-lite form is physically moved in (Step 2), but the
 * SHAPE of the seam (values in, adapter operations, capability gating) is intended to be
 * stable.
 */

import type {
  MaritalStatus,
  DisplacementCategory,
  EducationLevel,
  PatientContact,
  PatientLanguage,
  NationalIdType,
} from '@ultranos/shared-types'

// ── Field model ────────────────────────────────────────────────────────────

export type PatientGender = 'male' | 'female' | 'other' | 'unknown'

/** FHIR AllergyIntolerance.criticality, as captured by the registration UI. */
export type AllergyCriticality = 'low' | 'high' | 'unable-to-assess'

export interface AllergyEntry {
  /** Present for existing allergies (edit mode); absent for newly-added ones. */
  id?: string
  substanceText: string
  /** Optional — a newly-added entry may be recorded before criticality is assessed. */
  criticality?: AllergyCriticality
}

/** A structured address (origin / current). Empty strings render as "not provided". */
export interface PatientAddress {
  province: string
  district: string
  village?: string
}

/** Raw vitals as entered in the form (strings — the mapper coerces + validates). */
export interface VitalsInput {
  weight: string
  height: string
  systolic: string
  diastolic: string
  temperature: string
}

/** Point-of-care / registration consent capture (append-only ledger write). */
export interface ConsentCaptureInput {
  method: 'WRITTEN' | 'VERBAL_WITNESSED'
  language: PatientLanguage
  version: string
  /** Practitioner ref for VERBAL_WITNESSED; omitted for WRITTEN. */
  witnessedBy?: string
}

export type BloodGroup =
  | 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'Unknown'

/**
 * The normalized field model the shared form reads/writes. A superset covering the
 * richest (OPD) flow; leaner apps hide sections via capabilities rather than using a
 * different model. On create, `nationalId` carries the raw value (hashed server-side);
 * in edit mode the form shows only the last-4 and only sends `nationalId` when changed.
 */
export interface PatientFormValues {
  // Identity
  nameGiven: string
  nameFather: string
  nameGrandfather: string
  nameFamily: string
  nameLocal: string
  nameLatin: string
  namePhonetic: string
  // Demographics
  gender: PatientGender | ''
  birthYear: string
  birthDate: string
  birthYearOnly: boolean
  maritalStatus?: MaritalStatus
  bloodGroup?: BloodGroup
  // National ID
  nationalId?: string
  nationalIdType?: NationalIdType
  // Contact
  phone: string
  phoneUse?: 'home' | 'work' | 'mobile'
  emergencyContacts: PatientContact[]
  // Address
  addressOrigin?: PatientAddress
  addressCurrent?: PatientAddress
  isNomadic: boolean
  // Social / HMIS
  displacementCategory?: DisplacementCategory
  nationality?: string
  occupation?: string
  educationLevel?: EducationLevel
  disability?: boolean
  householdId?: string
  // Preferences
  preferredLanguage?: PatientLanguage
  // Attached sub-records (capability-gated)
  photoDataUrl?: string
  allergies: AllergyEntry[]
  vitals?: VitalsInput
  consent?: ConsentCaptureInput
}

// ── Capabilities (what the form renders / permits) ──────────────────────────

export type PatientFormSection =
  | 'photo'
  | 'identity'
  | 'demographics'
  | 'nationalId'
  | 'contact'
  | 'address'
  | 'social'
  | 'allergies'
  | 'vitals'
  | 'consent'

export type SectionVisibility = 'edit' | 'read' | 'hidden'

/**
 * Drives which sections render and whether they are editable. Produced from the Hub
 * access policy tier (see capabilities.ts), never hand-rolled per app.
 */
export interface PatientFormCapabilities {
  sections: Record<PatientFormSection, SectionVisibility>
  /** Run the MPI duplicate check before create (always true for real create flows). */
  runDuplicateCheck: boolean
}

// ── Data adapter (the injected app layer) ────────────────────────────────────

/** MPI duplicate-check outcome. BLOCK stops submit; WARN requires an override reason. */
export interface DuplicateDecision {
  decision: 'ALLOW' | 'WARN' | 'BLOCK'
  matches?: Array<{ id: string; displayName?: string; score?: number }>
}

export interface PatientWriteResult {
  id: string
  /** Server `meta.lastUpdated` — used as the next `lastKnownUpdate` for Tier-3 LWW. */
  lastUpdated: string
}

export interface UpdatePatientArgs {
  patientId: string
  values: PatientFormValues
  /** The client's last-known server timestamp, for Tier-3 LWW conflict detection. */
  lastKnownUpdate: string
}

/**
 * Everything the shared form needs from its host app. The app owns offline-first
 * behavior (Dexie/sync-engine, `registerPatientLocally`, blind-ref lab flow, etc.);
 * the form only orchestrates these calls and never reaches into `@/lib/*`.
 *
 * Optional methods are only invoked when the matching capability is enabled, so a lean
 * app (e.g. lab) can omit photo/vitals/consent entirely.
 */
export interface PatientDataAdapter {
  /** MPI dedupe (create only). Every create flow MUST run this — no silent skips. */
  checkDuplicates(values: PatientFormValues): Promise<DuplicateDecision>
  /** Canonical create: Hub `patient.create` + local offline persist. Returns resolved id. */
  createPatient(values: PatientFormValues): Promise<PatientWriteResult>
  /** Canonical update (Tier-3 LWW). */
  updatePatient(args: UpdatePatientArgs): Promise<PatientWriteResult>

  // Capability-gated sub-record operations:
  /** Load current active allergies for edit-mode prefill. */
  fetchAllergies?(patientId: string): Promise<AllergyEntry[]>
  /** Append-only allergy reconciliation (Tier-1 — never LWW). */
  syncAllergies?(patientId: string, desired: AllergyEntry[], original: AllergyEntry[]): Promise<void>
  /** Upload a captured photo (opaque-key mechanism lives in the app/Hub). */
  uploadPhoto?(patientId: string, dataUrl: string): Promise<void>
  /** Persist entered vitals as patient-scoped Observations (append-only). */
  persistVitals?(patientId: string, vitals: VitalsInput): Promise<void>
  /** Append a consent grant to the ledger (registration or point-of-care). */
  recordConsent?(patientId: string, consent: ConsentCaptureInput): Promise<void>
}

export type PatientFormMode = 'create' | 'edit'

/**
 * Photo operations injected into the shared PatientPhotoSection. The opaque-key upload
 * mechanism + Hub transport live in the host app (Rule #7); the shared component only
 * orchestrates the capture/crop UX and calls these.
 */
export interface PatientPhotoApi {
  getPatientPhotoUrl(patientId: string, signal?: AbortSignal): Promise<string | null>
  uploadPatientPhoto(
    patientId: string,
    blob: Blob,
    lastKnownUpdate: string,
  ): Promise<{ photoUrl: string; lastUpdated: string }>
  removePatientPhoto(
    patientId: string,
    lastKnownUpdate: string,
  ): Promise<{ lastUpdated: string }>
}
