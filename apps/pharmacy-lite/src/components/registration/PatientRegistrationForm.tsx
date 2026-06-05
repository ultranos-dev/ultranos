'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { z } from 'zod'
import { AdministrativeGender } from '@ultranos/shared-types'
import type { AfghanProvince } from '@ultranos/shared-types'
import { Button } from '@/components/ui/button'
import { NameInputSection } from './NameInputSection'
import { GeographySection } from './GeographySection'
import { ConsentSection } from './ConsentSection'
import { MpiResultModal } from './MpiResultModal'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { Card } from '@/components/Card'
import { db } from '@/lib/db'
import { EncryptionKeyNotAvailableError } from '@/lib/encryption-key-store'
import type { FhirPatient } from '@ultranos/shared-types'

// ── Hub API helpers ──────────────────────────────────────────────────────────
// Raw fetch wrappers matching the existing pattern in @/lib/trpc.ts.
// These call the hub-api tRPC endpoints directly.

function getHubApiUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
  }
  return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const supabase = getSupabaseBrowserClient()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

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

// ── Local validation schema (client-side, mirrors server CreatePatientMpiInputSchema) ──

const CURRENT_YEAR = new Date().getFullYear()

const ClientRegistrationSchema = z.object({
  nameGiven: z.string().min(1, 'required').max(200),
  nameFather: z.string().max(200).optional(),
  nameGrandfather: z.string().max(200).optional(),
  gender: z.nativeEnum(AdministrativeGender, { required_error: 'required' }),
  birthYearOnly: z.boolean(),
  birthYear: z.number().int().min(1900).max(CURRENT_YEAR).optional(),
  birthDate: z.string().optional(),
  phone: z.string().max(50).optional(),
  nationalId: z.string().max(200).optional(),
  preferredLanguage: z.enum(['en', 'ar', 'prs']).optional(),
  isNomadic: z.boolean().optional(),
  bloodGroup: z.string().optional(),
  addressOriginProvince: z.string().min(1, 'required'),
  addressOriginDistrict: z.string().min(1, 'required'),
  addressOriginVillage: z.string().max(200).optional(),
  addressCurrentProvince: z.string().optional(),
  addressCurrentDistrict: z.string().optional(),
  addressCurrentVillage: z.string().max(200).optional(),
  consentMethod: z.enum(['WRITTEN', 'VERBAL_WITNESSED'], { required_error: 'required' }),
  consentWitnessedBy: z.string().optional(),
  consentLanguage: z.enum(['en', 'ar', 'prs']),
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
  const isRtl = locale === 'ar' || locale === 'prs'
  const router = useRouter()

  // ── Form state ──
  const [nameGiven, setNameGiven] = useState(prefilledNameGiven)
  const [nameFather, setNameFather] = useState('')
  const [nameGrandfather, setNameGrandfather] = useState('')
  const [gender, setGender] = useState<AdministrativeGender | ''>('')
  const [birthYearOnly, setBirthYearOnly] = useState(true)
  const [birthYear, setBirthYear] = useState<string>('')
  const [birthDate, setBirthDate] = useState('')
  const [phone, setPhone] = useState('')
  const [nationalId, setNationalId] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState<'en' | 'ar' | 'prs'>(
    locale === 'prs' ? 'prs' : locale === 'ar' ? 'ar' : 'en',
  )
  const [isNomadic, setIsNomadic] = useState(false)
  const [bloodGroup, setBloodGroup] = useState<string>('Unknown')

  // Address
  const [addressOrigin, setAddressOrigin] = useState<AddressFields>(EMPTY_ADDRESS)
  const [addressCurrent, setAddressCurrent] = useState<AddressFields>(EMPTY_ADDRESS)
  const [sameAsOrigin, setSameAsOrigin] = useState(false)

  // Consent
  const [consentMethod, setConsentMethod] = useState<'WRITTEN' | 'VERBAL_WITNESSED' | ''>('')
  const [consentWitnessedBy, setConsentWitnessedBy] = useState('')
  const [consentLanguage, setConsentLanguage] = useState<'en' | 'ar' | 'prs'>(
    locale === 'prs' ? 'prs' : locale === 'ar' ? 'ar' : 'en',
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
      const nameLocal = [nameGiven, nameFather, nameGrandfather]
        .filter(Boolean)
        .join(' ')

      const payload: Record<string, unknown> = {
        nameLocal,
        nameGiven,
        nameFather: nameFather || undefined,
        nameGrandfather: nameGrandfather || undefined,
        gender: gender || undefined,
        birthYearOnly,
        birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
        birthDate: birthDate || undefined,
        phone: phone || undefined,
        nationalId: nationalId || undefined,
        isNomadic,
        preferredLanguage: preferredLanguage || undefined,
        bloodGroup: bloodGroup !== 'Unknown' ? bloodGroup : undefined,
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
      nameGiven, nameFather, nameGrandfather, gender, birthYearOnly,
      birthYear, birthDate, phone, nationalId, preferredLanguage, isNomadic, bloodGroup,
      addressOrigin, addressCurrent, sameAsOrigin, consentMethod, consentWitnessedBy, consentLanguage,
    ],
  )

  // ── Validate ──

  const validate = useCallback((): boolean => {
    const result = ClientRegistrationSchema.safeParse({
      nameGiven,
      nameFather: nameFather || undefined,
      nameGrandfather: nameGrandfather || undefined,
      gender: gender || undefined,
      birthYearOnly,
      birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
      birthDate: birthDate || undefined,
      phone: phone || undefined,
      nationalId: nationalId || undefined,
      preferredLanguage: preferredLanguage || undefined,
      isNomadic,
      bloodGroup: bloodGroup || undefined,
      addressOriginProvince: addressOrigin.province,
      addressOriginDistrict: addressOrigin.district,
      addressOriginVillage: addressOrigin.village || undefined,
      addressCurrentProvince: addressCurrent.province || undefined,
      addressCurrentDistrict: addressCurrent.district || undefined,
      addressCurrentVillage: addressCurrent.village || undefined,
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
    nameGiven, nameFather, nameGrandfather, gender, birthYearOnly,
    birthYear, birthDate, phone, nationalId, preferredLanguage, isNomadic, bloodGroup,
    addressOrigin, addressCurrent, consentMethod, consentWitnessedBy, consentLanguage, t,
  ])

  // ── Persist to local IndexedDB so PatientChartPage can load immediately ──

  const savePatientLocally = useCallback(
    async (id: string, now: string) => {
      const nameLocal = [nameGiven, nameFather, nameGrandfather]
        .filter(Boolean)
        .join(' ')

      const patient: FhirPatient = {
        id,
        resourceType: 'Patient',
        name: [{ given: nameGiven ? [nameGiven] : [], text: nameLocal }],
        gender: (gender as AdministrativeGender) || AdministrativeGender.UNKNOWN,
        birthDate: birthDate || (birthYear ? birthYear : undefined) as string | undefined,
        birthYearOnly,
        telecom: phone ? [{ system: 'phone', value: phone }] : [],
        _ultranos: {
          nameLocal,
          nameGiven: nameGiven || undefined,
          nameFather: nameFather || undefined,
          nameGrandfather: nameGrandfather || undefined,
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
          nationalIdHash: undefined, // Hash computed server-side; not available locally
          isActive: true,
          patient_tier: 'FREE',
          createdAt: now,
        },
        meta: { lastUpdated: now },
      }

      try {
        await db.patients.put(patient)
      } catch (err) {
        if (err instanceof EncryptionKeyNotAvailableError) {
          // Re-throw — caller must handle this so the user isn't
          // redirected to a page that can't load the patient.
          throw err
        }
        // Other IndexedDB errors — patient exists on Hub, will sync later.
      }
    },
    [nameGiven, nameFather, nameGrandfather, gender, birthDate, birthYear, birthYearOnly, phone, nationalId, preferredLanguage, isNomadic, bloodGroup, addressOrigin, addressCurrent, sameAsOrigin],
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

        // Step 1: Check for duplicates — map form fields to the flat shape the API expects
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
          // Step 2a: No duplicates — create patient
          const created = await createPatient(payload)
          try {
            await savePatientLocally(created.id, new Date().toISOString())
          } catch (saveErr) {
            if (saveErr instanceof EncryptionKeyNotAvailableError) {
              // Patient was created on Hub but can't be cached locally.
              // Redirect to login so the encryption key is initialized.
              const returnUrl = encodeURIComponent(`/${locale}/patient/${created.id}`)
              window.location.href = `/${locale}/login?returnUrl=${returnUrl}`
              return
            }
          }
          router.push(`/${locale}/patient/${created.id}`)
        } else {
          // Step 2b: Possible duplicates — always treat as WARN until scoring algorithm is refined
          // TODO: Restore BLOCK handling once MPI scoring is production-ready
          setMpiDecision('WARN')
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
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {/* Name section */}
        <NameInputSection
          nameGiven={nameGiven}
          nameFather={nameFather}
          nameGrandfather={nameGrandfather}
          onNameGivenChange={setNameGiven}
          onNameFatherChange={setNameFather}
          onNameGrandfatherChange={setNameGrandfather}
          errors={{
            nameGiven: fieldErrors.nameGiven,
            nameFather: fieldErrors.nameFather,
            nameGrandfather: fieldErrors.nameGrandfather,
          }}
        />

        {/* Demographics section */}
        <Card as="fieldset">
          <legend className="text-base font-bold text-foreground mb-4">
            {t('demographicsSection')}
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
                className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder={t('nationalIdPlaceholder')}
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
              />
            </div>

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
                onChange={(e) =>
                  setGender(e.target.value as AdministrativeGender)
                }
                aria-invalid={!!fieldErrors.gender}
                className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                  fieldErrors.gender
                    ? 'border-destructive focus:border-destructive focus:ring-destructive'
                    : 'border-border focus:border-blue-400 focus:ring-blue-400'
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
                  className="h-5 w-5 border-border text-blue-600 focus:ring-blue-400"
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
                        : 'border-border focus:border-blue-400 focus:ring-blue-400'
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
                        : 'border-border focus:border-blue-400 focus:ring-blue-400'
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

            {/* Phone */}
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
              <input
                id="phone"
                type="tel"
                dir="ltr"
                inputMode="tel"
                className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder={t('phonePlaceholder')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
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
                onChange={(e) =>
                  setPreferredLanguage(e.target.value as 'en' | 'ar' | 'prs')
                }
                className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="en">English</option>
                <option value="ar">{isRtl ? '\u0627\u0644\u0639\u0631\u0628\u064A\u0629' : 'Arabic'}</option>
                <option value="prs">{isRtl ? '\u062F\u0631\u06CC' : 'Dari'}</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Geography section */}
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

        {/* Clinical section */}
        <Card as="fieldset">
          <legend className="text-base font-bold text-foreground mb-4">
            {t('clinicalSection')}
          </legend>

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
              className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {BLOOD_GROUPS.map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
            </select>
          </div>
        </Card>

        {/* Consent section */}
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
        <Button variant="default" type="submit" disabled={submitting} className="w-full">
          {submitting ? t('submitting') : t('submitRegistration')}
        </Button>
      </form>

      {/* MPI duplicate result modal */}
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
