'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { z } from 'zod'
import { AdministrativeGender } from '@ultranos/shared-types'
import type {
  AfghanProvince,
  MaritalStatus,
  DisplacementCategory,
  EducationLevel,
  PatientContact,
  PatientLanguage,
} from '@ultranos/shared-types'
import { Button } from '@/components/ui/Button'
import { NameInputSection } from './NameInputSection'
import { PatientPhotoSection } from './PatientPhotoSection'
import { GeographySection } from './GeographySection'
import { ConsentSection } from './ConsentSection'
import { MpiResultModal } from './MpiResultModal'
import { SocialInfoSection } from './SocialInfoSection'
import { EmergencyContactSection } from './EmergencyContactSection'
import { getHubApiUrl, getAuthHeaders } from '@/lib/hub-auth'
import { Card } from '@/components/Card'
import { db } from '@/lib/db'
import { EncryptionKeyNotAvailableError } from '@/lib/encryption-key-store'
import type { FhirPatient } from '@ultranos/shared-types'

interface CheckDuplicatesResult {
  decision: 'ALLOW' | 'WARN' | 'BLOCK'
  candidates: Array<{
    id: string
    nameGiven?: string
    nameFather?: string
    birthYear?: number
    gender?: string
    districtOrigin?: string
    mpiScore: number
    scoreBreakdown: Record<string, number>
  }>
  proceedToken?: string
}

interface CreatePatientResult {
  id: string
}

async function checkDuplicates(input: Record<string, unknown>): Promise<CheckDuplicatesResult> {
  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/patient.checkDuplicates'
  url.searchParams.set('input', JSON.stringify({ json: input }))

  const headers = await getAuthHeaders()
  const res = await fetch(url.toString(), { headers })
  if (!res.ok) throw new Error(`Hub API error: ${res.status}`)
  const body = await res.json() as { result: { data: { json: CheckDuplicatesResult } } }
  return body.result.data.json
}

async function createPatient(input: Record<string, unknown>): Promise<CreatePatientResult> {
  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/patient.create'

  const headers = await getAuthHeaders()
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ json: input }),
  })
  if (!res.ok) throw new Error(`Hub API error: ${res.status}`)
  const body = await res.json() as { result: { data: { json: CreatePatientResult } } }
  return body.result.data.json
}

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
  consentMethod: z.enum(['WRITTEN', 'VERBAL_WITNESSED'], { required_error: 'required' }),
  consentWitnessedBy: z.string().optional(),
  consentLanguage: z.enum(['en', 'ar', 'prs', 'ps']),
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

// ── Component ────────────────────────────────────────────────────────────────

interface PatientRegistrationFormProps {
  prefilledNameGiven?: string
}

export function PatientRegistrationForm({
  prefilledNameGiven = '',
}: PatientRegistrationFormProps) {
  const t = useTranslations('registration')
  const locale = useLocale()
  const isRtl = locale === 'ar' || locale === 'prs' || locale === 'ps'
  const router = useRouter()

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

  // MPI modal state
  const [mpiModalOpen, setMpiModalOpen] = useState(false)
  const [mpiDecision, setMpiDecision] = useState<'WARN' | 'BLOCK'>('WARN')
  const [mpiCandidates, setMpiCandidates] = useState<CheckDuplicatesResult['candidates']>([])
  const [mpiProceedToken, setMpiProceedToken] = useState<string | undefined>()

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
      birthYear, birthDate, phone, phoneUse, nationalId, preferredLanguage,
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

    if (!result.success) {
      const errors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const key = issue.path.join('.')
        if (!errors[key]) {
          errors[key] = issue.message === 'required' ? t('fieldRequired') : issue.message
        }
      }
      setFieldErrors(errors)
      return false
    }

    setFieldErrors({})
    return true
  }, [
    nameGiven, nameFather, nameGrandfather, nameFamily, gender, birthYearOnly,
    birthYear, birthDate, phone, phoneUse, nationalId, preferredLanguage,
    isNomadic, bloodGroup, maritalStatus,
    addressOrigin, addressCurrent,
    displacementCategory, nationality, occupation, educationLevel, disability,
    consentMethod, consentWitnessedBy, consentLanguage, t,
  ])

  // ── Persist to local IndexedDB ──

  const savePatientLocally = useCallback(
    async (id: string, now: string) => {
      const nameLocal = [nameGiven, nameFather, nameGrandfather, nameFamily]
        .filter(Boolean)
        .join(' ')

      const patient: FhirPatient = {
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
          preferredLanguage: preferredLanguage || undefined,
          nationalIdHash: undefined,
          isActive: true,
          patient_tier: 'FREE',
          createdAt: now,
          displacementCategory: (displacementCategory as DisplacementCategory) || undefined,
          nationality: nationality || undefined,
          occupation: occupation || undefined,
          educationLevel: (educationLevel as EducationLevel) || undefined,
          disability: disability,
        },
        meta: { lastUpdated: now },
      }

      try {
        await db.patients.put(patient)
      } catch (err) {
        if (err instanceof EncryptionKeyNotAvailableError) {
          throw err
        }
      }
    },
    [
      nameGiven, nameFather, nameGrandfather, nameFamily, gender, birthDate, birthYear,
      birthYearOnly, phone, phoneUse, preferredLanguage, isNomadic, bloodGroup,
      maritalStatus, addressOrigin, addressCurrent, sameAsOrigin,
      displacementCategory, nationality, occupation, educationLevel, disability,
      emergencyContacts,
    ],
  )

  // ── Submit handler ──

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setSubmitError('')

      if (!validate()) return

      setSubmitting(true)
      try {
        const payload = buildPayload()

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
        const dupeResult = await checkDuplicates(dupeCheckInput)

        if (dupeResult.decision === 'ALLOW') {
          const created = await createPatient(payload)
          try {
            await savePatientLocally(created.id, new Date().toISOString())
          } catch (saveErr) {
            if (saveErr instanceof EncryptionKeyNotAvailableError) {
              const returnUrl = encodeURIComponent(`/${locale}/patient/${created.id}`)
              window.location.href = `/${locale}/login?returnUrl=${returnUrl}`
              return
            }
          }
          router.push(`/${locale}/patient/${created.id}`)
        } else {
          setMpiDecision(dupeResult.decision as 'WARN' | 'BLOCK')
          setMpiCandidates(dupeResult.candidates)
          setMpiProceedToken(dupeResult.proceedToken)
          setMpiModalOpen(true)
        }
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : t('submitError'),
        )
      } finally {
        setSubmitting(false)
      }
    },
    [validate, buildPayload, savePatientLocally, router, locale, t],
  )

  // ── MPI modal handlers ──

  const handleMpiProceed = useCallback(
    async (token: string) => {
      setMpiModalOpen(false)
      setSubmitting(true)
      setSubmitError('')

      try {
        const payload = buildPayload(token)
        const created = await createPatient(payload)
        try {
          await savePatientLocally(created.id, new Date().toISOString())
        } catch (saveErr) {
          if (saveErr instanceof EncryptionKeyNotAvailableError) {
            const returnUrl = encodeURIComponent(`/${locale}/patient/${created.id}`)
            window.location.href = `/${locale}/login?returnUrl=${returnUrl}`
            return
          }
        }
        router.push(`/${locale}/patient/${created.id}`)
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : t('submitError'),
        )
      } finally {
        setSubmitting(false)
      }
    },
    [buildPayload, savePatientLocally, router, locale, t],
  )

  const handleMpiCancel = useCallback(() => {
    setMpiModalOpen(false)
  }, [])

  const handleGoToPatient = useCallback(
    (patientId: string) => {
      setMpiModalOpen(false)
      router.push(`/${locale}/patient/${patientId}`)
    },
    [router, locale],
  )

  return (
    <>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* 1. Patient photo */}
        <PatientPhotoSection
          photoDataUrl={photoDataUrl}
          onPhotoChange={setPhotoDataUrl}
        />

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

        {/* 3. Demographics — Gender, DOB, Marital Status, Blood Group */}
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
                aria-invalid={!!fieldErrors.gender}
                className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
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
                  <input
                    id="birth-year"
                    type="number"
                    inputMode="numeric"
                    min={1900}
                    max={CURRENT_YEAR}
                    aria-invalid={!!fieldErrors.birthYear}
                    className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                      fieldErrors.birthYear
                        ? 'border-destructive focus:border-destructive focus:ring-destructive'
                        : 'border-border focus:border-primary focus:ring-ring'
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
                  <input
                    id="birth-date"
                    type="date"
                    aria-invalid={!!fieldErrors.birthDate}
                    className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                      fieldErrors.birthDate
                        ? 'border-destructive focus:border-destructive focus:ring-destructive'
                        : 'border-border focus:border-primary focus:ring-ring'
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
                className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
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
                className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
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

        {/* 4. Contact & Identification — National ID, Phone, Preferred Language */}
        <Card as="fieldset">
          <legend className="text-base font-bold text-foreground">
            {t('contactSection')}
          </legend>

          <div className="space-y-4">
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
              <input
                id="national-id"
                type="text"
                inputMode="text"
                maxLength={200}
                className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={t('nationalIdPlaceholder')}
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
              />
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
                  className="min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">{t('phoneUsePlaceholder')}</option>
                  <option value="mobile">{t('phoneUseMobile')}</option>
                  <option value="home">{t('phoneUseHome')}</option>
                  <option value="work">{t('phoneUseWork')}</option>
                </select>
                <input
                  id="phone"
                  type="tel"
                  dir="ltr"
                  inputMode="tel"
                  className="flex-1 min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
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
                className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="en">{t('languageEnglish')}</option>
                <option value="ar">{t('languageArabic')}</option>
                <option value="prs">{t('languageDari')}</option>
                <option value="ps">{t('languagePashto')}</option>
              </select>
            </div>
          </div>
        </Card>

        {/* 5. Geography section */}
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

        {/* 6. Social / HMIS section */}
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

        {/* 7. Emergency contact section */}
        <EmergencyContactSection
          contacts={emergencyContacts}
          onContactsChange={setEmergencyContacts}
        />

        {/* 8. Consent section */}
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

        {/* Submit error */}
        {submitError && (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {submitError}
          </div>
        )}

        {/* Submit button */}
        <Button variant="primary" type="submit" disabled={submitting} fullWidth>
          {submitting ? t('submitting') : t('submitRegistration')}
        </Button>
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
