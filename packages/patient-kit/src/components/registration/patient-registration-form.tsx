'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { z } from 'zod'
import { AdministrativeGender, calculateBMI, AuditAction, AuditResourceType } from '@ultranos/shared-types'
import type {
  AfghanProvince,
  MaritalStatus,
  DisplacementCategory,
  EducationLevel,
  PatientContact,
  PatientLanguage,
  FhirAllergyIntolerance,
  FhirPatient,
} from '@ultranos/shared-types'
import { Alert } from '@ultranos/ui-kit/components/ui/alert'
import { Input } from '@ultranos/ui-kit/components/ui/input'
import { Button } from '../ui/button.js'
import { Card } from '../ui/card.js'
import { NameInputSection } from './name-input-section.js'
import { PatientPhotoSection } from './patient-photo-section.js'
import { GeographySection } from './geography-section.js'
import { ConsentSection } from './consent-section.js'
import { MpiResultModal } from './mpi-result-modal.js'
import { SocialInfoSection } from './social-info-section.js'
import { EmergencyContactSection } from './emergency-contact-section.js'
import { AllergiesSection, type AllergyEntry } from './allergies-section.js'
import type {
  PatientFormAdapter,
  PatientFormExternals,
  PatientFormCapabilities,
  PatientFormSection,
  CheckDuplicatesResult,
  VitalRangeStatus as RangeStatus,
  VitalFieldKey as VitalKey,
} from '../../types.js'
import { isSectionVisible, fullFormCapabilities } from '../../capabilities.js'


// ── Validation schema ────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()

const ClientRegistrationSchema = z.object({
  nameGiven: z.string().min(1, 'required').max(200),
  nameFather: z.string().max(200).optional(),
  nameGrandfather: z.string().max(200).optional(),
  nameFamily: z.string().max(200).optional(),
  gender: z.nativeEnum(AdministrativeGender, { required_error: 'required' }),
  birthYearOnly: z.boolean(),
  birthYear: z.number().int().min(1900).max(CURRENT_YEAR).optional(),
  birthDate: z.string().optional(),
  phone: z.string().max(50).optional(),
  phoneUse: z.enum(['home', 'work', 'mobile']).optional(),
  nationalId: z.string().max(200).optional(),
  preferredLanguage: z.enum(['en', 'ar', 'prs', 'ps']).optional(),
  isNomadic: z.boolean().optional(),
  bloodGroup: z.string().optional(),
  householdId: z.string().max(64).regex(/^[A-Za-z0-9-]+$/, 'householdIdInvalid').optional(),
  nationalIdType: z.enum(['TAZKIRA_PAPER', 'ETAZKIRA', 'PASSPORT', 'UNHCR', 'OTHER']).optional(),
  maritalStatus: z.enum(['M', 'S', 'D', 'W', 'UNK']).optional(),
  addressOriginProvince: z.string().min(1, 'required'),
  addressOriginDistrict: z.string().min(1, 'required'),
  addressOriginVillage: z.string().max(200).optional(),
  addressCurrentProvince: z.string().optional(),
  addressCurrentDistrict: z.string().optional(),
  addressCurrentVillage: z.string().max(200).optional(),
  displacementCategory: z.enum(['IDP', 'RETURNEE', 'REFUGEE', 'HOST_COMMUNITY']).optional(),
  nationality: z.string().length(2).optional(),
  occupation: z.string().max(200).optional(),
  educationLevel: z.enum(['NONE', 'PRIMARY', 'SECONDARY', 'TERTIARY', 'UNKNOWN']).optional(),
  disability: z.boolean().optional(),
  // Consent is required at registration (enforced create-only in validate()); in
  // edit mode it is an optional point-of-care re-capture, so it is optional here.
  consentMethod: z.enum(['WRITTEN', 'VERBAL_WITNESSED']).optional(),
  consentWitnessedBy: z.string().optional(),
  consentLanguage: z.enum(['en', 'ar', 'prs', 'ps']).optional(),
}).superRefine((val, ctx) => {
  if (val.birthYearOnly && !val.birthYear) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthYear'], message: 'required' })
  }
  if (!val.birthYearOnly && !val.birthDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthDate'], message: 'required' })
  }
  if (val.consentMethod === 'VERBAL_WITNESSED' && !val.consentWitnessedBy) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['consentWitnessedBy'], message: 'required' })
  }
})

// ── Address state type ───────────────────────────────────────────────────────

interface AddressFields {
  province: AfghanProvince | ''
  district: string
  village: string
}

const EMPTY_ADDRESS: AddressFields = { province: '', district: '', village: '' }

const BLOOD_GROUPS = [
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown',
] as const

type NationalIdType = 'TAZKIRA_PAPER' | 'ETAZKIRA' | 'PASSPORT' | 'UNHCR' | 'OTHER'

const NATIONAL_ID_TYPES: { value: NationalIdType; labelKey: string }[] = [
  { value: 'TAZKIRA_PAPER', labelKey: 'idTypeTazkiraPaper' },
  { value: 'ETAZKIRA',      labelKey: 'idTypeEtazkira' },
  { value: 'PASSPORT',      labelKey: 'idTypePassport' },
  { value: 'UNHCR',         labelKey: 'idTypeUnhcr' },
  { value: 'OTHER',         labelKey: 'idTypeOther' },
]

// Error-summary metadata: maps a fieldErrors key to its DOM anchor (for
// focus/scroll) and an i18n label key. Keys without an anchor still render.
const ERROR_FIELD_META: Record<string, { anchor?: string; labelKey: string }> = {
  nameGiven:             { anchor: 'name-given',                labelKey: 'nameGiven' },
  gender:                { anchor: 'gender',                    labelKey: 'gender' },
  birthYear:             { anchor: 'birth-year',                labelKey: 'birthYear' },
  birthDate:             { anchor: 'birth-date',                labelKey: 'birthDate' },
  addressOriginProvince: { labelKey: 'province' },
  addressOriginDistrict: { labelKey: 'district' },
  householdId:           { anchor: 'household-id',              labelKey: 'householdIdLabel' },
  consentMethod:         { anchor: 'consent-method-label',      labelKey: 'consentMethod' },
  consentWitnessedBy:    { anchor: 'consent-witness',           labelKey: 'consentWitness' },
  consentLanguage:       { anchor: 'consent-language',          labelKey: 'consentLanguage' },
  guardianContact:       { anchor: 'emergency-contacts-anchor', labelKey: 'emergencyContactSection' },
}

// SNOMED CT "No known allergy" — coded marker stored when the clinician
// affirms NKDA, so "asked, none" is distinguishable from "never asked".
const NKDA_SUBSTANCE = 'No known allergies (NKDA)'
const NKDA_CODE = '716186003'
const NKDA_SYSTEM = 'http://snomed.info/sct'

const ALLERGY_CLINICAL_SYSTEM = 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical'
const ALLERGY_VERIFICATION_SYSTEM = 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification'

/**
 * Build a FhirAllergyIntolerance for the allergy store (edit-mode add / append-only
 * edit). Unconfirmed / unable-to-assess by default until a clinician verifies.
 */
function buildFhirAllergy(patientId: string, entry: AllergyEntry, recordedByRole: string, hlcTimestamp: string): FhirAllergyIntolerance {
  const now = new Date().toISOString()
  const isNkda = entry.substanceText === NKDA_SUBSTANCE
  return {
    id: crypto.randomUUID(),
    resourceType: 'AllergyIntolerance',
    clinicalStatus: { coding: [{ system: ALLERGY_CLINICAL_SYSTEM, code: 'active' }] },
    verificationStatus: { coding: [{ system: ALLERGY_VERIFICATION_SYSTEM, code: 'unconfirmed' }] },
    type: 'allergy',
    criticality: entry.criticality ?? 'unable-to-assess',
    code: isNkda
      ? { coding: [{ system: NKDA_SYSTEM, code: NKDA_CODE, display: NKDA_SUBSTANCE }], text: NKDA_SUBSTANCE }
      : { coding: [], text: entry.substanceText },
    patient: { reference: `Patient/${patientId}` },
    recordedDate: now,
    _ultranos: {
      substanceFreeText: entry.substanceText,
      createdAt: now,
      recordedByRole,
      isOfflineCreated: false,
      hlcTimestamp,
    },
    meta: { lastUpdated: now },
  }
}

/** Stable identity for allergy-diff comparison (substance + coarse criticality). */
function allergyKey(a: AllergyEntry): string {
  return `${a.substanceText.trim()}|${a.criticality ?? 'unable-to-assess'}`
}

/**
 * Append-only allergy diff for edit-mode save: which existing allergy ids to
 * deactivate (removed or changed) and which entries to add (new or changed).
 * "Changed" = deactivate the old + add the new — the record is never mutated
 * in place (Tier-1 append-only, Safety Rule #5). Pure + exported for testing.
 */
export function diffAllergies(
  desired: AllergyEntry[],
  original: AllergyEntry[],
): { toDeactivate: string[]; toAdd: AllergyEntry[] } {
  const desiredKeys = new Set(desired.map(allergyKey))
  const originalKeys = new Set(original.map(allergyKey))
  const toDeactivate = original
    .filter((o) => o.id && !desiredKeys.has(allergyKey(o)))
    .map((o) => o.id as string)
  const toAdd = desired.filter((d) => !originalKeys.has(allergyKey(d)))
  return { toDeactivate, toAdd }
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Edit-mode context. When provided, the form becomes the "Edit Profile" surface:
 * it pre-fills from an existing patient, hides the photo section (photo is edited
 * on the header avatar), makes consent an optional point-of-care re-capture, and
 * on submit runs patient.update + an append-only allergy diff (via the allergy
 * store) + an optional consent append — never MPI dedup / create.
 */
export interface RegistrationEditContext {
  patientId: string
  patient: FhirPatient
  /** Active allergies for this patient, mapped to form entries (each carries its id). */
  existingAllergies: AllergyEntry[]
  lastKnownUpdate: string
  onSaved: (updated: FhirPatient) => void
  onCancel: () => void
}

interface PatientRegistrationFormProps {
  prefilledNameGiven?: string
  editContext?: RegistrationEditContext
  /** Create mode only: called by Cancel when the form is hosted in a modal
   *  (falls back to navigateBack() when absent). Edit mode uses editContext.onCancel. */
  onCancel?: () => void
  /** Data seam — the host app's Hub/offline/persistence implementation. */
  adapter: PatientFormAdapter
  /** Non-data host deps (clinical vitals subsystem, allergy store, hlc, audit, photo). */
  externals: PatientFormExternals
  /** Which sections render/are editable. Defaults to the full clinical set (opd-lite). */
  capabilities?: PatientFormCapabilities
}

export function PatientRegistrationForm({
  prefilledNameGiven = '',
  editContext,
  onCancel,
  adapter,
  externals,
  capabilities = fullFormCapabilities,
}: PatientRegistrationFormProps) {
  const t = useTranslations('registration')
  const locale = useLocale()
  const isRtl = locale === 'ar' || locale === 'prs' || locale === 'ps'
  const editing = !!editContext
  // Section visibility (capability-driven). Under the default full set every section shows,
  // so opd-lite behavior is unchanged; pharmacy/lab pass reduced capabilities.
  const show = (s: PatientFormSection) => isSectionVisible(capabilities, s)
  const {
    addAllergyToStore,
    updateAllergyStatus,
    auditPhiAccess,
    hlc,
    serializeHlc,
    mapVitalsToObservations,
    LOINC,
    getVitalRangeStatus,
    isEncryptionKeyError,
    loadVitalsObservations,
    VitalsForm,
    photoApi,
    navigate,
    navigateBack,
  } = externals

  // ── Form state ──
  const [nameGiven, setNameGiven] = useState(prefilledNameGiven)
  const [nameFather, setNameFather] = useState('')
  const [nameGrandfather, setNameGrandfather] = useState('')
  const [nameFamily, setNameFamily] = useState('')
  const [gender, setGender] = useState<AdministrativeGender | ''>('')
  const [birthYearOnly, setBirthYearOnly] = useState(true)
  const [birthYear, setBirthYear] = useState<string>('')
  const [birthDate, setBirthDate] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneUse, setPhoneUse] = useState<'home' | 'work' | 'mobile' | ''>('')
  const [nationalId, setNationalId] = useState('')
  const [nationalIdType, setNationalIdType] = useState<NationalIdType | ''>('')
  const [householdId, setHouseholdId] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState<PatientLanguage>(
    locale === 'prs' ? 'prs' : locale === 'ar' ? 'ar' : locale === 'ps' ? 'ps' : 'en',
  )
  const [isNomadic, setIsNomadic] = useState(false)
  const [bloodGroup, setBloodGroup] = useState<string>('Unknown')
  const [maritalStatus, setMaritalStatus] = useState<MaritalStatus | ''>('')

  // Address
  const [addressOrigin, setAddressOrigin] = useState<AddressFields>(EMPTY_ADDRESS)
  const [addressCurrent, setAddressCurrent] = useState<AddressFields>(EMPTY_ADDRESS)
  const [sameAsOrigin, setSameAsOrigin] = useState(false)

  // Social / HMIS fields
  const [displacementCategory, setDisplacementCategory] = useState<DisplacementCategory | ''>('')
  const [nationality, setNationality] = useState('')
  const [occupation, setOccupation] = useState('')
  const [educationLevel, setEducationLevel] = useState<EducationLevel | ''>('')
  const [disability, setDisability] = useState(false)

  // Patient photo
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)

  // Allergies (Tier-1 safety) — NKDA affirmation or a free-text substance list
  const [noKnownAllergies, setNoKnownAllergies] = useState(false)
  const [allergies, setAllergies] = useState<AllergyEntry[]>([])

  // Vitals — captured as patient-scoped Observations (no encounter). BMI derived.
  const [vitalWeight, setVitalWeight] = useState('')
  const [vitalHeight, setVitalHeight] = useState('')
  const [vitalSystolic, setVitalSystolic] = useState('')
  const [vitalDiastolic, setVitalDiastolic] = useState('')
  const [vitalTemperature, setVitalTemperature] = useState('')
  const originalVitalsRef = useRef({ weight: '', height: '', systolic: '', diastolic: '', temperature: '' })

  // Emergency contacts
  const [emergencyContacts, setEmergencyContacts] = useState<PatientContact[]>([])

  // Consent
  const [consentMethod, setConsentMethod] = useState<'WRITTEN' | 'VERBAL_WITNESSED' | ''>('')
  const [consentWitnessedBy, setConsentWitnessedBy] = useState('')
  const [consentLanguage, setConsentLanguage] = useState<PatientLanguage>(
    locale === 'prs' ? 'prs' : locale === 'ar' ? 'ar' : locale === 'ps' ? 'ps' : 'en',
  )

  // UI state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [isDirty, setIsDirty] = useState(!!prefilledNameGiven)
  // Edit mode: National ID is stored one-way hashed (Rule #7), so the raw value can
  // never be pre-filled. When one is on file we show a masked placeholder until the
  // clinician clicks to enter a replacement. `nidEditing` tracks that reveal.
  const [nidEditing, setNidEditing] = useState(false)
  const hasNationalIdOnFile = !!editContext?.patient?._ultranos?.nationalIdHash
  const nidLast4 = editContext?.patient?._ultranos?.nationalIdLast4
  // The consent captured at read time — used to detect a real change before
  // appending a new (append-only) consent grant on save.
  const originalConsentRef = useRef<{ method?: string; language?: string }>({})
  // Track whether the component has mounted so we can skip the first effect run
  const mountedRef = useRef(false)

  // MPI modal state
  const [mpiModalOpen, setMpiModalOpen] = useState(false)
  const [mpiDecision, setMpiDecision] = useState<'WARN' | 'BLOCK'>('WARN')
  const [mpiCandidates, setMpiCandidates] = useState<CheckDuplicatesResult['candidates']>([])
  const [mpiProceedToken, setMpiProceedToken] = useState<string | undefined>()

  // ── Edit-mode prefill ──
  // Populate every field from the existing patient once (guarded by a ref) so the
  // Edit Profile modal opens fully pre-filled and later user edits are preserved.
  const prefilledRef = useRef(false)
  useEffect(() => {
    if (!editContext || prefilledRef.current) return
    prefilledRef.current = true
    const p = editContext.patient
    const u = p._ultranos
    setNameGiven(u.nameGiven ?? p.name?.[0]?.given?.[0] ?? '')
    setNameFather(u.nameFather ?? '')
    setNameGrandfather(u.nameGrandfather ?? '')
    setNameFamily(u.nameFamily ?? p.name?.[0]?.family ?? '')
    setGender((p.gender as AdministrativeGender) ?? '')
    const yearOnly = p.birthYearOnly ?? true
    setBirthYearOnly(yearOnly)
    setBirthYear(u.birthYear != null ? String(u.birthYear) : '')
    setBirthDate(!yearOnly && p.birthDate ? p.birthDate : '')
    const tel = p.telecom?.find((x) => x.system === 'phone')
    setPhone(tel?.value ?? '')
    setPhoneUse((tel?.use as 'home' | 'work' | 'mobile') ?? '')
    setNationalIdType((u.nationalIdType as NationalIdType) ?? '')
    setHouseholdId(u.householdId ?? '')
    if (u.preferredLanguage) setPreferredLanguage(u.preferredLanguage)
    setIsNomadic(u.isNomadic ?? false)
    setBloodGroup(u.bloodGroup ?? 'Unknown')
    setMaritalStatus((p.maritalStatus as MaritalStatus) ?? '')
    if (u.addressOrigin) {
      setAddressOrigin({
        province: u.addressOrigin.province as AfghanProvince,
        district: u.addressOrigin.district ?? '',
        village: u.addressOrigin.village ?? '',
      })
    }
    if (u.addressCurrent) {
      setAddressCurrent({
        province: u.addressCurrent.province as AfghanProvince,
        district: u.addressCurrent.district ?? '',
        village: u.addressCurrent.village ?? '',
      })
    }
    setDisplacementCategory((u.displacementCategory as DisplacementCategory) ?? '')
    setNationality(u.nationality ?? '')
    setOccupation(u.occupation ?? '')
    setEducationLevel((u.educationLevel as EducationLevel) ?? '')
    setDisability(u.disability ?? false)
    if (p.contact && p.contact.length > 0) setEmergencyContacts(p.contact)
    // Allergies: prefill from existing (each entry carries its id). A lone NKDA
    // marker → the "no known allergies" toggle; otherwise the substance list.
    const existing = editContext.existingAllergies
    const nkdaOnly = existing.length === 1 && existing[0]?.substanceText === NKDA_SUBSTANCE
    if (nkdaOnly) {
      setNoKnownAllergies(true)
      setAllergies([])
    } else {
      setAllergies(existing.filter((a) => a.substanceText !== NKDA_SUBSTANCE))
    }
    // Consent: prefill from the latest recorded grant and remember it, so we only
    // append a NEW grant on save when the clinician actually changes it.
    if (u.consentMethod) setConsentMethod(u.consentMethod)
    if (u.consentLanguage) setConsentLanguage(u.consentLanguage)
    originalConsentRef.current = { method: u.consentMethod, language: u.consentLanguage }
  }, [editContext])

  // Edit mode: prefill vitals from the patient's latest local Observations (the
  // same source the header's baseline vitals read), keeping the latest per LOINC.
  useEffect(() => {
    if (!editContext) return
    let cancelled = false
    void (async () => {
      try {
        const obs = await loadVitalsObservations(`Patient/${editContext.patientId}`)
        const latest = new Map<string, (typeof obs)[number]>()
        for (const o of obs) {
          const code = o.code?.coding?.[0]?.code
          if (!code) continue
          const ex = latest.get(code)
          if (!ex || (o._ultranos?.hlcTimestamp ?? '') > (ex._ultranos?.hlcTimestamp ?? '')) {
            latest.set(code, o)
          }
        }
        if (cancelled) return
        const next = { weight: '', height: '', systolic: '', diastolic: '', temperature: '' }
        for (const [code, o] of latest) {
          if (code === LOINC.BODY_WEIGHT && o.valueQuantity) next.weight = String(o.valueQuantity.value)
          else if (code === LOINC.BODY_HEIGHT && o.valueQuantity) next.height = String(o.valueQuantity.value)
          else if (code === LOINC.BODY_TEMPERATURE && o.valueQuantity) next.temperature = String(o.valueQuantity.value)
          else if (code === LOINC.BLOOD_PRESSURE && o.component) {
            for (const c of o.component) {
              const cc = c.code?.coding?.[0]?.code
              if (cc === LOINC.SYSTOLIC_BP && c.valueQuantity) next.systolic = String(c.valueQuantity.value)
              else if (cc === LOINC.DIASTOLIC_BP && c.valueQuantity) next.diastolic = String(c.valueQuantity.value)
            }
          }
        }
        setVitalWeight(next.weight); setVitalHeight(next.height); setVitalSystolic(next.systolic)
        setVitalDiastolic(next.diastolic); setVitalTemperature(next.temperature)
        originalVitalsRef.current = next
      } catch {
        // Best-effort — no local vitals available; the section starts empty.
      }
    })()
    return () => { cancelled = true }
  }, [editContext])

  // ── Dirty tracking ──
  // Mark the form as dirty after first mount whenever any field value changes.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    setIsDirty(true)
  }, [
    nameGiven, nameFather, nameGrandfather, nameFamily, gender, birthYearOnly,
    birthYear, birthDate, phone, phoneUse, nationalId, preferredLanguage,
    isNomadic, bloodGroup, maritalStatus, addressOrigin, addressCurrent,
    sameAsOrigin, displacementCategory, nationality, occupation, educationLevel,
    disability, emergencyContacts, consentMethod, consentWitnessedBy,
    consentLanguage, photoDataUrl, nationalIdType, householdId,
    noKnownAllergies, allergies,
    vitalWeight, vitalHeight, vitalSystolic, vitalDiastolic, vitalTemperature,
  ])

  // ── Unsaved-changes guard ──
  // Warn on tab close / reload / external navigation while the form is dirty so a
  // half-entered patient record isn't lost. In-app Cancel is guarded separately.
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // ── Derived: patient age & guardian requirement for minors ──
  const birthYearNum = birthYearOnly
    ? (birthYear ? parseInt(birthYear, 10) : undefined)
    : (birthDate ? parseInt(birthDate.slice(0, 4), 10) : undefined)
  const patientAge = birthYearNum && birthYearNum >= 1900 ? CURRENT_YEAR - birthYearNum : undefined
  const isMinor = patientAge !== undefined && patientAge >= 0 && patientAge < 18
  const hasGuardianContact = emergencyContacts.some(
    (c) => c.relationship === 'GUARDIAN' || c.relationship === 'PARENT',
  )

  // Build the allergies payload: an NKDA coded marker, or the non-empty substances.
  const buildAllergiesInput = useCallback(() => {
    if (noKnownAllergies) {
      return [{ substanceText: NKDA_SUBSTANCE, substanceCode: NKDA_CODE, substanceSystem: NKDA_SYSTEM, criticality: 'low' as const }]
    }
    const cleaned = allergies
      .map((a) => ({ substanceText: a.substanceText.trim(), criticality: a.criticality }))
      .filter((a) => a.substanceText.length > 0)
    return cleaned.length > 0 ? cleaned : undefined
  }, [noKnownAllergies, allergies])

  // ── Build submission payload ──

  const buildPayload = useCallback(
    (proceedToken?: string) => {
      const nameLocal = [nameGiven, nameFather, nameGrandfather, nameFamily]
        .filter(Boolean)
        .join(' ')

      const payload: Record<string, unknown> = {
        nameLocal,
        nameGiven,
        nameFather: nameFather || undefined,
        nameGrandfather: nameGrandfather || undefined,
        nameFamily: nameFamily || undefined,
        gender: gender || undefined,
        birthYearOnly,
        birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
        birthDate: birthDate || undefined,
        phone: phone || undefined,
        phoneUse: phoneUse || undefined,
        nationalId: nationalId || undefined,
        nationalIdType: nationalIdType || undefined,
        householdId: householdId || undefined,
        allergies: buildAllergiesInput(),
        isNomadic,
        preferredLanguage: preferredLanguage || undefined,
        bloodGroup: bloodGroup !== 'Unknown' ? bloodGroup : undefined,
        maritalStatus: maritalStatus || undefined,
        addressOrigin: addressOrigin.province
          ? {
              province: addressOrigin.province,
              district: addressOrigin.district,
              village: addressOrigin.village || undefined,
            }
          : undefined,
        addressCurrent: sameAsOrigin
          ? (addressOrigin.province
              ? {
                  province: addressOrigin.province,
                  district: addressOrigin.district,
                  village: addressOrigin.village || undefined,
                }
              : undefined)
          : (addressCurrent.province
              ? {
                  province: addressCurrent.province,
                  district: addressCurrent.district,
                  village: addressCurrent.village || undefined,
                }
              : undefined),
        displacementCategory: displacementCategory || undefined,
        nationality: nationality || undefined,
        occupation: occupation || undefined,
        educationLevel: educationLevel || undefined,
        disability: disability,
        contacts: emergencyContacts.length > 0 ? emergencyContacts : undefined,
        consent: {
          method: consentMethod,
          witnessedBy: consentMethod === 'VERBAL_WITNESSED' ? consentWitnessedBy : undefined,
          language: consentLanguage,
          version: '1.0',
        },
      }

      if (proceedToken) {
        payload.mpiProceedToken = proceedToken
      }

      return payload
    },
    [
      nameGiven, nameFather, nameGrandfather, nameFamily, gender, birthYearOnly,
      birthYear, birthDate, phone, phoneUse, nationalId, nationalIdType, householdId,
      buildAllergiesInput, preferredLanguage,
      isNomadic, bloodGroup, maritalStatus,
      addressOrigin, addressCurrent, sameAsOrigin,
      displacementCategory, nationality, occupation, educationLevel, disability,
      emergencyContacts, consentMethod, consentWitnessedBy, consentLanguage,
    ],
  )

  // ── Validate ──

  const validate = useCallback((): boolean => {
    const result = ClientRegistrationSchema.safeParse({
      nameGiven,
      nameFather: nameFather || undefined,
      nameGrandfather: nameGrandfather || undefined,
      nameFamily: nameFamily || undefined,
      gender: gender || undefined,
      birthYearOnly,
      birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
      birthDate: birthDate || undefined,
      phone: phone || undefined,
      phoneUse: phoneUse || undefined,
      nationalId: nationalId || undefined,
      nationalIdType: nationalIdType || undefined,
      householdId: householdId || undefined,
      preferredLanguage: preferredLanguage || undefined,
      isNomadic,
      bloodGroup: bloodGroup || undefined,
      maritalStatus: maritalStatus || undefined,
      addressOriginProvince: addressOrigin.province,
      addressOriginDistrict: addressOrigin.district,
      addressOriginVillage: addressOrigin.village || undefined,
      addressCurrentProvince: addressCurrent.province || undefined,
      addressCurrentDistrict: addressCurrent.district || undefined,
      addressCurrentVillage: addressCurrent.village || undefined,
      displacementCategory: displacementCategory || undefined,
      nationality: nationality || undefined,
      occupation: occupation || undefined,
      educationLevel: educationLevel || undefined,
      disability: disability,
      consentMethod: consentMethod || undefined,
      consentWitnessedBy: consentWitnessedBy || undefined,
      consentLanguage,
    })

    const errors: Record<string, string> = {}
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path.join('.')
        if (!errors[key]) {
          const msg = issue.message
          errors[key] =
            msg === 'required' ? t('fieldRequired')
            : msg === 'householdIdInvalid' ? t('householdIdInvalid')
            : msg
        }
      }
    }

    // Consent is mandatory at registration (create) only. In edit mode it is an
    // optional point-of-care re-capture, so an empty consent section is valid.
    if (!editing && show('consent')) {
      if (!consentMethod) errors.consentMethod = t('fieldRequired')
      if (!consentLanguage) errors.consentLanguage = t('fieldRequired')
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return false
    }

    setFieldErrors({})
    return true
  }, [
    nameGiven, nameFather, nameGrandfather, nameFamily, gender, birthYearOnly,
    birthYear, birthDate, phone, phoneUse, nationalId, nationalIdType, householdId,
    preferredLanguage,
    isNomadic, bloodGroup, maritalStatus,
    addressOrigin, addressCurrent,
    displacementCategory, nationality, occupation, educationLevel, disability,
    consentMethod, consentWitnessedBy, consentLanguage, editing, t,
  ])

  // ── Persist to local IndexedDB ──

  // Build the FhirPatient row written to local encrypted Dexie. `offlineFlags`
  // marks a provisional (offline-registered) row so the UI can hint "verifying
  // for duplicates when online" and the drain reconciliation can find it.
  const buildLocalPatient = useCallback(
    (id: string, now: string, offlineFlags?: { mpiPending: boolean; isOfflineCreated: boolean }): FhirPatient => {
      const nameLocal = [nameGiven, nameFather, nameGrandfather, nameFamily]
        .filter(Boolean)
        .join(' ')

      return {
        id,
        resourceType: 'Patient',
        name: [{ given: nameGiven ? [nameGiven] : [], family: nameFamily || undefined, text: nameLocal }],
        gender: (gender as AdministrativeGender) || AdministrativeGender.UNKNOWN,
        birthDate: birthDate || (birthYear ? birthYear : undefined) as string | undefined,
        birthYearOnly,
        maritalStatus: (maritalStatus as MaritalStatus) || undefined,
        telecom: phone
          ? [{ system: 'phone', value: phone, use: phoneUse || undefined }]
          : [],
        contact: emergencyContacts.length > 0 ? emergencyContacts : undefined,
        _ultranos: {
          nameLocal,
          nameGiven: nameGiven || undefined,
          nameFather: nameFather || undefined,
          nameGrandfather: nameGrandfather || undefined,
          nameFamily: nameFamily || undefined,
          birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
          addressOrigin: addressOrigin.province
            ? { province: addressOrigin.province, district: addressOrigin.district, village: addressOrigin.village || undefined }
            : undefined,
          addressCurrent: sameAsOrigin
            ? (addressOrigin.province
                ? { province: addressOrigin.province, district: addressOrigin.district, village: addressOrigin.village || undefined }
                : undefined)
            : (addressCurrent.province
                ? { province: addressCurrent.province, district: addressCurrent.district, village: addressCurrent.village || undefined }
                : undefined),
          isNomadic,
          bloodGroup: bloodGroup !== 'Unknown' ? bloodGroup : undefined,
          householdId: householdId || undefined,
          nationalIdType: (nationalIdType as NationalIdType) || undefined,
          preferredLanguage: preferredLanguage || undefined,
          nationalIdHash: undefined,
          // Directory "NID missing" badge derives from this; the hash is computed
          // server-side, so record presence locally from what the clinician entered.
          hasNationalId: !!nationalId,
          nationalIdLast4: nationalId ? nationalId.slice(-4) : undefined,
          isActive: true,
          patient_tier: 'FREE',
          createdAt: now,
          displacementCategory: (displacementCategory as DisplacementCategory) || undefined,
          nationality: nationality || undefined,
          occupation: occupation || undefined,
          educationLevel: (educationLevel as EducationLevel) || undefined,
          disability: disability,
          ...(offlineFlags ? { mpiPending: offlineFlags.mpiPending, isOfflineCreated: offlineFlags.isOfflineCreated } : {}),
        },
        meta: { lastUpdated: now },
      }
    },
    [
      nameGiven, nameFather, nameGrandfather, nameFamily, gender, birthDate, birthYear,
      birthYearOnly, phone, phoneUse, preferredLanguage, isNomadic, bloodGroup,
      householdId, nationalIdType, nationalId,
      maritalStatus, addressOrigin, addressCurrent, sameAsOrigin,
      displacementCategory, nationality, occupation, educationLevel, disability,
      emergencyContacts,
    ],
  )

  const savePatientLocally = useCallback(
    async (id: string, now: string) => {
      const patient = buildLocalPatient(id, now)
      try {
        await adapter.savePatient(patient)
      } catch (err) {
        if (isEncryptionKeyError(err)) {
          throw err
        }
      }
    },
    [buildLocalPatient],
  )

  // Offline registration fallback (Story 60.3, C-OPD-2): persist the patient
  // locally with a provisional id + mpiPending flag and enqueue the Hub sync.
  // The clinician can start an encounter immediately; MPI runs at drain.
  const registerOffline = useCallback(
    async (payload: Record<string, unknown>): Promise<string> => {
      const provisionalId = crypto.randomUUID()
      const now = new Date().toISOString()
      const localPatient = buildLocalPatient(provisionalId, now, { mpiPending: true, isOfflineCreated: true })
      // The queued payload is the patient.syncCreate input: the create payload
      // (which already carries `consent`) plus offlineCreatedAt. mpiProceedToken
      // is meaningless offline — the Hub re-runs MPI at drain — so drop it.
      const { mpiProceedToken: _drop, ...syncPayload } = payload
      await adapter.registerOffline(
        provisionalId,
        localPatient,
        { ...syncPayload, offlineCreatedAt: now },
        photoDataUrl,
      )
      return provisionalId
    },
    [buildLocalPatient, photoDataUrl],
  )

  // Upload the captured photo AFTER the patient exists (Rule #7: the server stores
  // it under an opaque random key and returns a signed reference — the spoke never
  // holds the raw key). Non-fatal: a failed photo upload must never strand a
  // successfully created patient. Online path only; offline photo capture is added
  // from the profile once connectivity returns.
  const uploadPhotoIfPresent = useCallback(
    async (patientId: string) => {
      if (!photoDataUrl) return
      try {
        await adapter.uploadPhoto(patientId, photoDataUrl)
      } catch {
        // Swallow — the clinician can add the photo later from the patient profile.
      }
    },
    [photoDataUrl],
  )

  // Persist entered vitals as patient-scoped, append-only Observations (no encounter
  // — a baseline/profile capture). Best-effort: vitals must never fail the save.
  const persistVitals = useCallback(
    async (patientId: string) => {
      try {
        const bmi = calculateBMI(parseFloat(vitalWeight), parseFloat(vitalHeight))
        const observations = mapVitalsToObservations(
          {
            weight: vitalWeight, height: vitalHeight,
            systolic: vitalSystolic, diastolic: vitalDiastolic,
            temperature: vitalTemperature, bmi,
          },
          { patientId, hlcTimestamp: serializeHlc(hlc.now()), nowIso: new Date().toISOString() },
        )
        if (observations.length === 0) return
        await adapter.saveObservations(observations)
        // Rule #6 — audit the local PHI write (opaque ids only). The sync-worker
        // emits a separate SYNC audit when these push to the Hub.
        auditPhiAccess(AuditAction.CREATE, AuditResourceType.OBSERVATION, patientId, patientId, {
          phiAccess: 'vitals_capture',
          source: editing ? 'profile_edit' : 'registration',
        })
      } catch {
        // Best-effort — a vitals write must never fail the patient create/update.
      }
    },
    [vitalWeight, vitalHeight, vitalSystolic, vitalDiastolic, vitalTemperature, editing],
  )

  const vitalsChanged = useCallback(() => {
    const o = originalVitalsRef.current
    return (
      vitalWeight !== o.weight || vitalHeight !== o.height ||
      vitalSystolic !== o.systolic || vitalDiastolic !== o.diastolic ||
      vitalTemperature !== o.temperature
    )
  }, [vitalWeight, vitalHeight, vitalSystolic, vitalDiastolic, vitalTemperature])

  // ── Submit handler ──

  // ── Edit-mode save ──
  // patient.update (all fields) + optional point-of-care consent append + an
  // append-only allergy diff via the allergy store. No MPI dedup / create.
  const runEditSave = useCallback(async () => {
    if (!editContext) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const nameLocal = [nameGiven, nameFather, nameGrandfather, nameFamily].filter(Boolean).join(' ')
      const updateInput: Record<string, unknown> = {
        patientId: editContext.patientId,
        lastKnownUpdate: editContext.lastKnownUpdate,
        nameLocal,
        nameGiven,
        nameFather: nameFather || undefined,
        nameGrandfather: nameGrandfather || undefined,
        nameFamily: nameFamily || undefined,
        gender: gender || undefined,
        birthYearOnly,
        birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
        birthDate: !birthYearOnly && birthDate ? birthDate : undefined,
        telecomPhone: phone || undefined,
        phoneUse: phoneUse || undefined,
        nationalIdType: nationalIdType || undefined,
        householdId: householdId || undefined,
        preferredLanguage: preferredLanguage || undefined,
        isNomadic,
        bloodGroup: bloodGroup !== 'Unknown' ? bloodGroup : undefined,
        maritalStatus: maritalStatus || undefined,
        addressProvinceOrigin: addressOrigin.province || undefined,
        addressDistrictOrigin: addressOrigin.district || undefined,
        addressVillageOrigin: addressOrigin.village || undefined,
        addressProvinceCurrent: sameAsOrigin ? (addressOrigin.province || undefined) : (addressCurrent.province || undefined),
        addressDistrictCurrent: sameAsOrigin ? (addressOrigin.district || undefined) : (addressCurrent.district || undefined),
        addressVillageCurrent: sameAsOrigin ? (addressOrigin.village || undefined) : (addressCurrent.village || undefined),
        displacementCategory: displacementCategory || undefined,
        nationality: nationality || undefined,
        occupation: occupation || undefined,
        educationLevel: educationLevel || undefined,
        disability,
        contacts: emergencyContacts.length > 0 ? emergencyContacts : undefined,
        // Only re-hashed server-side if the clinician typed a new value (blank = unchanged).
        nationalId: nationalId || undefined,
      }
      const res = await adapter.updatePatient(updateInput)
      const now = res.meta?.lastUpdated ?? new Date().toISOString()

      // Optional point-of-care consent re-capture — append a new grant ONLY when the
      // clinician actually changed method/language (the ledger is append-only, so
      // re-saving unchanged consent must not create duplicate records).
      const consentChanged =
        !!consentMethod &&
        (consentMethod !== originalConsentRef.current.method ||
          consentLanguage !== originalConsentRef.current.language)
      if (consentChanged) {
        try {
          await adapter.recordConsent({
            patientId: editContext.patientId,
            method: consentMethod,
            language: consentLanguage,
            version: '1.0',
          })
        } catch { /* non-fatal — the demographic update already saved */ }
      }

      // Append-only allergy diff via the allergy store (add new/changed; deactivate removed).
      if (show('allergies')) {
        const desired: AllergyEntry[] = noKnownAllergies
          ? [{ substanceText: NKDA_SUBSTANCE, criticality: 'low' }]
          : allergies.filter((a) => a.substanceText.trim())
        const { toDeactivate, toAdd } = diffAllergies(desired, editContext.existingAllergies)
        for (const id of toDeactivate) {
          try { await updateAllergyStatus(id, 'inactive') } catch { /* best-effort */ }
        }
        for (const d of toAdd) {
          try { await addAllergyToStore(buildFhirAllergy(editContext.patientId, d, 'CLINICIAN', serializeHlc(hlc.now()))) } catch { /* best-effort */ }
        }
      }

      // Vitals — record a new (append-only) patient-scoped snapshot only if changed.
      if (show('vitals') && vitalsChanged()) {
        await persistVitals(editContext.patientId)
      }

      // Refresh the local cache + notify the parent page.
      const updatedPatient = buildLocalPatient(editContext.patientId, now)
      try { await savePatientLocally(editContext.patientId, now) } catch { /* savePatientLocally handles the encryption-key case */ }
      editContext.onSaved(updatedPatient)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('submitError'))
    } finally {
      setSubmitting(false)
    }
  }, [
    editContext, nameGiven, nameFather, nameGrandfather, nameFamily, gender, birthYearOnly,
    birthYear, birthDate, phone, phoneUse, nationalId, nationalIdType, householdId,
    preferredLanguage, isNomadic, bloodGroup, maritalStatus, addressOrigin, addressCurrent,
    sameAsOrigin, displacementCategory, nationality, occupation, educationLevel, disability,
    emergencyContacts, consentMethod, consentLanguage, noKnownAllergies, allergies,
    buildLocalPatient, savePatientLocally, addAllergyToStore, updateAllergyStatus,
    persistVitals, vitalsChanged, t,
  ])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setSubmitError('')

      const isValid = validate()
      if (!isValid) {
        // Scroll to the first invalid field. We read the DOM (aria-invalid) rather
        // than fieldErrors state because setFieldErrors is async — the DOM reflects
        // the fresh render after rAF. All sections are always visible, so no
        // expand step is needed.
        requestAnimationFrame(() => {
          const firstInvalid = document.querySelector<HTMLElement>('[aria-invalid="true"]')
          if (firstInvalid) {
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' })
            firstInvalid.focus()
          }
        })
        return
      }

      // Guardian required for minors (enterprise pediatric registration): a patient
      // under 18 must have at least one PARENT/GUARDIAN emergency contact. Surface
      // as an error and scroll to the emergency-contacts section.
      if (isMinor && !hasGuardianContact) {
        setFieldErrors((prev) => ({ ...prev, guardianContact: t('guardianRequiredForMinor') }))
        requestAnimationFrame(() => {
          const el = document.getElementById('emergency-contacts-anchor')
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
        return
      }

      // Edit mode: update the existing patient (no MPI dedup / create).
      if (editing) {
        await runEditSave()
        return
      }

      setSubmitting(true)
      const payload = buildPayload()

      // Offline-first (Story 60.3, C-OPD-2): if the device is offline, don't
      // attempt a doomed Hub round-trip — register locally with a provisional id
      // and enqueue for sync. MPI duplicate-checking runs at drain, hub-side.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        try {
          const provisionalId = await registerOffline(payload)
          navigate(`/${locale}/patient/${provisionalId}`)
        } catch (offlineErr) {
          if (isEncryptionKeyError(offlineErr)) {
            window.location.href = `/${locale}/login?returnUrl=${encodeURIComponent(`/${locale}/registration`)}`
            return
          }
          setSubmitError(offlineErr instanceof Error ? offlineErr.message : t('submitError'))
        } finally {
          setSubmitting(false)
        }
        return
      }

      try {
        const dupeCheckInput: Record<string, unknown> = {
          nameGiven: payload.nameGiven,
          nameFather: payload.nameFather,
          nameGrandfather: payload.nameGrandfather,
          birthYear: payload.birthYear,
          gender: payload.gender,
          phone: payload.phone,
          nationalId: payload.nationalId as string | undefined,
          addressDistrictOrigin: (payload.addressOrigin as { district?: string } | undefined)?.district,
          addressProvinceOrigin: (payload.addressOrigin as { province?: string } | undefined)?.province,
        }
        const dupeResult = await adapter.checkDuplicates(dupeCheckInput)

        if (dupeResult.decision === 'ALLOW') {
          const created = await adapter.createPatient(payload)
          try {
            await savePatientLocally(created.id, new Date().toISOString())
          } catch (saveErr) {
            if (isEncryptionKeyError(saveErr)) {
              const returnUrl = encodeURIComponent(`/${locale}/patient/${created.id}`)
              window.location.href = `/${locale}/login?returnUrl=${returnUrl}`
              return
            }
          }
          await uploadPhotoIfPresent(created.id)
          if (show('vitals')) await persistVitals(created.id)
          navigate(`/${locale}/patient/${created.id}`)
        } else {
          setMpiDecision(dupeResult.decision as 'WARN' | 'BLOCK')
          setMpiCandidates(dupeResult.candidates)
          setMpiProceedToken(dupeResult.proceedToken)
          setMpiModalOpen(true)
        }
      } catch (err) {
        // Network-class failure mid-submit → fall back to offline registration
        // rather than throwing (the "pull the ethernet cable" test). A hub 4xx/5xx
        // with a real message (e.g. a BLOCK PRECONDITION) is surfaced, not swallowed.
        if (adapter.isNetworkError(err)) {
          try {
            const provisionalId = await registerOffline(payload)
            navigate(`/${locale}/patient/${provisionalId}`)
            return
          } catch (offlineErr) {
            if (isEncryptionKeyError(offlineErr)) {
              window.location.href = `/${locale}/login?returnUrl=${encodeURIComponent(`/${locale}/registration`)}`
              return
            }
            setSubmitError(offlineErr instanceof Error ? offlineErr.message : t('submitError'))
            return
          }
        }
        setSubmitError(
          err instanceof Error ? err.message : t('submitError'),
        )
      } finally {
        setSubmitting(false)
      }
    },
    [validate, buildPayload, savePatientLocally, registerOffline, uploadPhotoIfPresent,
     persistVitals, isMinor, hasGuardianContact, editing, runEditSave, navigate, locale, t],
  )

  // ── MPI modal handlers ──

  const handleMpiProceed = useCallback(
    async (token: string) => {
      setMpiModalOpen(false)
      setSubmitting(true)
      setSubmitError('')

      const payload = buildPayload(token)
      try {
        const created = await adapter.createPatient(payload)
        try {
          await savePatientLocally(created.id, new Date().toISOString())
        } catch (saveErr) {
          if (isEncryptionKeyError(saveErr)) {
            const returnUrl = encodeURIComponent(`/${locale}/patient/${created.id}`)
            window.location.href = `/${locale}/login?returnUrl=${returnUrl}`
            return
          }
        }
        await uploadPhotoIfPresent(created.id)
        if (show('vitals')) await persistVitals(created.id)
        navigate(`/${locale}/patient/${created.id}`)
      } catch (err) {
        // Same offline fallback as handleSubmit: a connectivity failure while
        // confirming a WARN override registers the patient locally instead of
        // stranding the clinician. The provisional proceedToken is dropped —
        // the Hub re-runs MPI at drain.
        if (adapter.isNetworkError(err)) {
          try {
            const provisionalId = await registerOffline(payload)
            navigate(`/${locale}/patient/${provisionalId}`)
            return
          } catch (offlineErr) {
            if (isEncryptionKeyError(offlineErr)) {
              window.location.href = `/${locale}/login?returnUrl=${encodeURIComponent(`/${locale}/registration`)}`
              return
            }
            setSubmitError(offlineErr instanceof Error ? offlineErr.message : t('submitError'))
            return
          }
        }
        setSubmitError(
          err instanceof Error ? err.message : t('submitError'),
        )
      } finally {
        setSubmitting(false)
      }
    },
    [buildPayload, savePatientLocally, registerOffline, uploadPhotoIfPresent, persistVitals, navigate, locale, t],
  )

  const handleMpiCancel = useCallback(() => {
    setMpiModalOpen(false)
  }, [])

  const handleGoToPatient = useCallback(
    (patientId: string) => {
      setMpiModalOpen(false)
      navigate(`/${locale}/patient/${patientId}`)
    },
    [navigate, locale],
  )

  // Derived vitals: BMI + per-field range statuses (reuses the encounter-vitals config).
  const vitalsBmi = calculateBMI(parseFloat(vitalWeight), parseFloat(vitalHeight))
  const vitalRangeStatuses: Partial<Record<string, RangeStatus>> = {}
  {
    const fields: [VitalKey, string][] = [
      ['weight', vitalWeight], ['height', vitalHeight],
      ['systolic', vitalSystolic], ['diastolic', vitalDiastolic], ['temperature', vitalTemperature],
    ]
    for (const [key, raw] of fields) {
      const val = parseFloat(raw)
      if (raw !== '' && Number.isFinite(val)) {
        const s = getVitalRangeStatus(key, val)
        if (s !== 'normal') vitalRangeStatuses[key] = s
      }
    }
    if (vitalsBmi !== null) {
      const s = getVitalRangeStatus('bmi', vitalsBmi)
      if (s !== 'normal') vitalRangeStatuses.bmi = s
    }
  }

  const errorCount = Object.keys(fieldErrors).length

  // Focus/scroll to an errored field from the error-summary. All sections are
  // always visible, so this is a straight scroll — no group to expand first.
  const focusField = useCallback((anchor?: string) => {
    requestAnimationFrame(() => {
      const el = anchor
        ? document.getElementById(anchor)
        : document.querySelector<HTMLElement>('[aria-invalid="true"]')
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.focus?.()
      }
    })
  }, [])

  return (
    <>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Error summary — announced on failed submit, links to each errored field */}
        {errorCount > 0 && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-xl bg-destructive/10 p-4 ring-[0.65px] ring-destructive/30"
          >
            <p className="text-sm font-semibold text-destructive">
              {t('errorSummaryTitle', { count: errorCount })}
            </p>
            <ul className="mt-2 space-y-1">
              {Object.entries(fieldErrors).map(([key, msg]) => {
                const meta = ERROR_FIELD_META[key]
                const label = meta ? t(meta.labelKey) : key
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => focusField(meta?.anchor)}
                      className="text-start text-sm text-destructive underline underline-offset-2 hover:no-underline"
                    >
                      {label}: {msg}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        {/* 1. Identity — photo first, then names (grouped for verification).
            Create: deferred local capture. Edit: immediate upload to the patient. */}
        {show('photo') && (
        <PatientPhotoSection
          photoDataUrl={photoDataUrl}
          onPhotoChange={setPhotoDataUrl}
          patientId={editContext?.patientId}
          lastKnownUpdate={editContext?.lastKnownUpdate}
          photoApi={photoApi}
        />
        )}

        {/* 2. Name section */}
        <NameInputSection
          nameGiven={nameGiven}
          nameFather={nameFather}
          nameGrandfather={nameGrandfather}
          nameFamily={nameFamily}
          onNameGivenChange={setNameGiven}
          onNameFatherChange={setNameFather}
          onNameGrandfatherChange={setNameGrandfather}
          onNameFamilyChange={setNameFamily}
          errors={{
            nameGiven: fieldErrors.nameGiven,
            nameFather: fieldErrors.nameFather,
            nameGrandfather: fieldErrors.nameGrandfather,
            nameFamily: fieldErrors.nameFamily,
          }}
        />

        {/* 2. Demographics — Gender, DOB, Marital Status, Blood Group */}
        <Card as="fieldset">
          <legend className="text-base font-bold text-foreground">
            {t('demographicsSection')}
          </legend>

          <div className="space-y-4">
            {/* Gender */}
            <div>
              <label
                htmlFor="gender"
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('gender')}
                <span className="text-destructive ms-0.5" aria-hidden="true">*</span>
              </label>
              <select
                id="gender"
                value={gender}
                onChange={(e) => setGender(e.target.value as AdministrativeGender)}
                required
                aria-required="true"
                aria-invalid={!!fieldErrors.gender}
                className={`w-full min-h-[44px] rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                  fieldErrors.gender
                    ? 'border-destructive focus:border-destructive focus:ring-destructive'
                    : 'border-border focus:border-primary focus:ring-ring'
                }`}
              >
                <option value="">{t('genderPlaceholder')}</option>
                <option value={AdministrativeGender.MALE}>{t('genderMale')}</option>
                <option value={AdministrativeGender.FEMALE}>{t('genderFemale')}</option>
                <option value={AdministrativeGender.OTHER}>{t('genderOther')}</option>
                <option value={AdministrativeGender.UNKNOWN}>{t('genderUnknown')}</option>
              </select>
              {fieldErrors.gender && (
                <p className="mt-1 text-sm text-destructive" role="alert">
                  {fieldErrors.gender}
                </p>
              )}
            </div>

            {/* Birth year or full date toggle */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={birthYearOnly}
                  onChange={(e) => {
                    setBirthYearOnly(e.target.checked)
                    if (e.target.checked) setBirthDate('')
                    else setBirthYear('')
                  }}
                  className="h-5 w-5 border-border text-primary focus:ring-ring"
                />
                <span className="text-sm font-medium text-foreground">
                  {t('birthYearOnly')}
                </span>
              </label>

              {birthYearOnly ? (
                <div>
                  <label
                    htmlFor="birth-year"
                    className="mb-1 block text-sm font-semibold text-foreground"
                  >
                    {t('birthYear')}
                    <span className="text-destructive ms-0.5" aria-hidden="true">*</span>
                  </label>
                  <Input
                    id="birth-year"
                    type="number"
                    inputMode="numeric"
                    min={1900}
                    max={CURRENT_YEAR}
                    required
                    aria-required="true"
                    aria-invalid={!!fieldErrors.birthYear}
                    className={`min-h-[44px] ${
                      fieldErrors.birthYear
                        ? 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30'
                        : ''
                    }`}
                    placeholder={t('birthYearPlaceholder')}
                    value={birthYear}
                    onChange={(e) => setBirthYear(e.target.value)}
                  />
                  {fieldErrors.birthYear && (
                    <p className="mt-1 text-sm text-destructive" role="alert">
                      {fieldErrors.birthYear}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="birth-date"
                    className="mb-1 block text-sm font-semibold text-foreground"
                  >
                    {t('birthDate')}
                    <span className="text-destructive ms-0.5" aria-hidden="true">*</span>
                  </label>
                  <Input
                    id="birth-date"
                    type="date"
                    required
                    aria-required="true"
                    aria-invalid={!!fieldErrors.birthDate}
                    className={`min-h-[44px] ${
                      fieldErrors.birthDate
                        ? 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30'
                        : ''
                    }`}
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                  />
                  {fieldErrors.birthDate && (
                    <p className="mt-1 text-sm text-destructive" role="alert">
                      {fieldErrors.birthDate}
                    </p>
                  )}
                </div>
              )}

              {isMinor && (
                <div
                  className="mt-2 flex items-start gap-2 rounded-xl bg-primary/5 px-3 py-2 text-sm text-foreground ring-[0.65px] ring-primary/20"
                  role="status"
                >
                  <span>{t('minorGuardianNotice')}</span>
                </div>
              )}
            </div>

            {/* Marital status */}
            <div>
              <label
                htmlFor="marital-status"
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('maritalStatus')}
                <span className="ms-1 text-xs font-normal text-muted-foreground">
                  ({t('optional')})
                </span>
              </label>
              <select
                id="marital-status"
                value={maritalStatus}
                onChange={(e) => setMaritalStatus(e.target.value as MaritalStatus | '')}
                className="w-full min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">{t('maritalStatusPlaceholder')}</option>
                <option value="M">{t('maritalMarried')}</option>
                <option value="S">{t('maritalSingle')}</option>
                <option value="D">{t('maritalDivorced')}</option>
                <option value="W">{t('maritalWidowed')}</option>
                <option value="UNK">{t('maritalUnknown')}</option>
              </select>
            </div>

            {/* Blood group */}
            <div>
              <label
                htmlFor="blood-group"
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('bloodGroup')}
                <span className="ms-1 text-xs font-normal text-muted-foreground">
                  ({t('optional')})
                </span>
              </label>
              <select
                id="blood-group"
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {/* 3b. Vitals — recorded as patient-scoped Observations (BMI auto-derived) */}
        {show('vitals') && (
        <Card as="fieldset">
          <legend className="text-base font-bold text-foreground">{t('vitalsSection')}</legend>
          <div className="mt-2">
            <VitalsForm
              weight={vitalWeight}
              height={vitalHeight}
              systolic={vitalSystolic}
              diastolic={vitalDiastolic}
              temperature={vitalTemperature}
              onWeightChange={setVitalWeight}
              onHeightChange={setVitalHeight}
              onSystolicChange={setVitalSystolic}
              onDiastolicChange={setVitalDiastolic}
              onTemperatureChange={setVitalTemperature}
              bmi={vitalsBmi}
              rangeStatuses={vitalRangeStatuses}
            />
          </div>
        </Card>
        )}

        {/* 4. Allergies — safety-critical, prominent, never collapsed (Rule #4) */}
        {show('allergies') && (
        <AllergiesSection
          noKnownAllergies={noKnownAllergies}
          allergies={allergies}
          onNoKnownAllergiesChange={setNoKnownAllergies}
          onAllergiesChange={setAllergies}
        />
        )}

        {/* 5. Contact & Identification — National ID (+ type), Household ID, Phone, Language */}
        <Card as="fieldset">
          <legend className="text-base font-bold text-foreground">
            {t('contactSection')}
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* National ID */}
            <div>
              <label
                htmlFor="national-id"
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('nationalIdLabel')}
                <span className="ms-1 text-xs font-normal text-muted-foreground">
                  ({t('optional')})
                </span>
              </label>
              {hasNationalIdOnFile && !nidEditing ? (
                <>
                  {/* Masked "on file" state — the raw ID is never stored (Rule #7),
                      so there is nothing to reveal. Click to enter a replacement. */}
                  <button
                    type="button"
                    onClick={() => {
                      setNidEditing(true)
                      requestAnimationFrame(() => document.getElementById('national-id')?.focus())
                    }}
                    className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-border bg-background px-4 py-2 text-sm text-muted-foreground hover:border-primary"
                    aria-label={t('nationalIdReplaceHint')}
                  >
                    <span aria-hidden="true" className="tracking-widest">
                      {nidLast4 ? `•••• ${nidLast4}` : '•••• •••• ••••'}
                    </span>
                    <span className="text-xs">{t('nationalIdOnFile')}</span>
                  </button>
                  <p className="mt-1 text-xs text-muted-foreground">{t('nationalIdReplaceHint')}</p>
                </>
              ) : (
                <Input
                  id="national-id"
                  type="text"
                  inputMode="text"
                  maxLength={200}
                  autoFocus={nidEditing}
                  className="min-h-[44px]"
                  placeholder={hasNationalIdOnFile ? t('nationalIdReplacePlaceholder') : t('nationalIdPlaceholder')}
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                />
              )}
            </div>

            {/* National ID type */}
            <div>
              <label
                htmlFor="national-id-type"
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('nationalIdTypeLabel')}
                <span className="ms-1 text-xs font-normal text-muted-foreground">
                  ({t('optional')})
                </span>
              </label>
              <select
                id="national-id-type"
                value={nationalIdType}
                onChange={(e) => setNationalIdType(e.target.value as NationalIdType | '')}
                className="w-full min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">{t('nationalIdTypePlaceholder')}</option>
                {NATIONAL_ID_TYPES.map((it) => (
                  <option key={it.value} value={it.value}>{t(it.labelKey)}</option>
                ))}
              </select>
            </div>

            {/* Household ID (alphanumeric) */}
            <div>
              <label
                htmlFor="household-id"
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('householdIdLabel')}
                <span className="ms-1 text-xs font-normal text-muted-foreground">
                  ({t('optional')})
                </span>
              </label>
              <Input
                id="household-id"
                type="text"
                inputMode="text"
                dir="ltr"
                maxLength={64}
                aria-invalid={!!fieldErrors.householdId}
                aria-describedby={fieldErrors.householdId ? 'household-id-error' : undefined}
                className={`min-h-[44px] ${
                  fieldErrors.householdId
                    ? 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30'
                    : ''
                }`}
                placeholder={t('householdIdPlaceholder')}
                value={householdId}
                onChange={(e) => setHouseholdId(e.target.value)}
              />
              {fieldErrors.householdId && (
                <p id="household-id-error" className="mt-1 text-sm text-destructive" role="alert">
                  {fieldErrors.householdId}
                </p>
              )}
            </div>

            {/* Phone + phone use type */}
            <div>
              <label
                htmlFor="phone"
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('phone')}
                <span className="ms-1 text-xs font-normal text-muted-foreground">
                  ({t('optional')})
                </span>
              </label>
              <div className="flex gap-2">
                <select
                  id="phone-use"
                  value={phoneUse}
                  onChange={(e) => setPhoneUse(e.target.value as 'home' | 'work' | 'mobile' | '')}
                  aria-label={t('phoneUse')}
                  className="min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">{t('phoneUsePlaceholder')}</option>
                  <option value="mobile">{t('phoneUseMobile')}</option>
                  <option value="home">{t('phoneUseHome')}</option>
                  <option value="work">{t('phoneUseWork')}</option>
                </select>
                <Input
                  id="phone"
                  type="tel"
                  dir="ltr"
                  inputMode="tel"
                  className="min-h-[44px] flex-1"
                  placeholder={t('phonePlaceholder')}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            {/* Preferred Language */}
            <div>
              <label
                htmlFor="preferred-language"
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('preferredLanguage')}
                <span className="ms-1 text-xs font-normal text-muted-foreground">
                  ({t('optional')})
                </span>
              </label>
              <select
                id="preferred-language"
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value as PatientLanguage)}
                className="w-full min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="en">{t('languageEnglish')}</option>
                <option value="ar">{t('languageArabic')}</option>
                <option value="prs">{t('languageDari')}</option>
                <option value="ps">{t('languagePashto')}</option>
              </select>
            </div>
          </div>
        </Card>

        {/* 4. Geography section */}
        {show('address') && (
        <GeographySection
          origin={addressOrigin}
          current={addressCurrent}
          sameAsOrigin={sameAsOrigin}
          onOriginChange={setAddressOrigin}
          onCurrentChange={setAddressCurrent}
          onSameAsOriginChange={setSameAsOrigin}
          isNomadic={isNomadic}
          onIsNomadicChange={setIsNomadic}
          errors={{
            originProvince: fieldErrors.addressOriginProvince,
            originDistrict: fieldErrors.addressOriginDistrict,
            currentProvince: fieldErrors.addressCurrentProvince,
            currentDistrict: fieldErrors.addressCurrentDistrict,
          }}
        />
        )}

        {/* 7. Social / HMIS section */}
        {show('social') && (
        <SocialInfoSection
          displacementCategory={displacementCategory}
          nationality={nationality}
          occupation={occupation}
          educationLevel={educationLevel}
          disability={disability}
          onDisplacementCategoryChange={setDisplacementCategory}
          onNationalityChange={setNationality}
          onOccupationChange={setOccupation}
          onEducationLevelChange={setEducationLevel}
          onDisabilityChange={setDisability}
        />
        )}

        {/* 8. Emergency contact section — always visible */}
        <div id="emergency-contacts-anchor">
          {fieldErrors.guardianContact && (
            <div
              className="mb-2 flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive ring-[0.65px] ring-destructive/30"
              role="alert"
            >
              <span>{fieldErrors.guardianContact}</span>
            </div>
          )}
          <EmergencyContactSection
            contacts={emergencyContacts}
            onContactsChange={setEmergencyContacts}
          />
        </div>

        {/* 9. Consent section */}
        {show('consent') && (
        <ConsentSection
          method={consentMethod}
          witnessedBy={consentWitnessedBy}
          language={consentLanguage}
          onMethodChange={setConsentMethod}
          onWitnessedByChange={setConsentWitnessedBy}
          onLanguageChange={setConsentLanguage}
          errors={{
            method: fieldErrors.consentMethod,
            witnessedBy: fieldErrors.consentWitnessedBy,
            language: fieldErrors.consentLanguage,
          }}
        />
        )}

        {/* Submit error */}
        {submitError && (
          <Alert variant="destructive" role="alert">
            {submitError}
          </Alert>
        )}

        {/* Sticky save bar */}
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-4 border-t border-border bg-background py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                if (!isDirty || window.confirm(t('discardChangesConfirm'))) {
                  if (editing) editContext!.onCancel()
                  else if (onCancel) onCancel()
                  else navigateBack()
                }
              }}
            >
              {t('cancel')}
            </Button>
            {errorCount > 0 && (
              <span className="text-sm font-medium text-destructive">
                {t('errorCount', { count: errorCount })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isDirty && (
              <span className="text-sm text-muted-foreground">
                {t('unsavedChanges')}
              </span>
            )}
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? t('submitting') : editing ? t('saveChanges') : t('submitRegistration')}
            </Button>
          </div>
        </div>
      </form>

      <MpiResultModal
        open={mpiModalOpen}
        decision={mpiDecision}
        candidates={mpiCandidates}
        proceedToken={mpiProceedToken}
        onProceed={handleMpiProceed}
        onCancel={handleMpiCancel}
        onGoToPatient={handleGoToPatient}
      />
    </>
  )
}
