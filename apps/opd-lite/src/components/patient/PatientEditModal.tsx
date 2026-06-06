'use client'

import { useState, useEffect, useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { X } from '@ultranos/ui-kit/icons'
import { z } from 'zod'
import { AdministrativeGender } from '@ultranos/shared-types'
import type { FhirPatient, AfghanProvince } from '@ultranos/shared-types'
import { NameInputSection } from '@/components/registration/NameInputSection'
import { GeographySection } from '@/components/registration/GeographySection'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { db } from '@/lib/db'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/Card'

// ── Types ───────────────────────────────────────────────────────────────────

interface PatientEditModalProps {
  open: boolean
  patient: FhirPatient
  patientId: string
  onClose: () => void
  onSaved: (updated: FhirPatient) => void
}

interface AddressFields {
  province: AfghanProvince | ''
  district: string
  village: string
}

const EMPTY_ADDRESS: AddressFields = { province: '', district: '', village: '' }

const BLOOD_GROUPS = [
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown',
] as const

// ── Hub API helpers ─────────────────────────────────────────────────────────

function getHubApiUrl(): string {
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

// ── Validation schema ───────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()

const PatientEditSchema = z.object({
  nameGiven: z.string().min(1, 'required').max(200),
  nameFather: z.string().max(200).optional(),
  nameGrandfather: z.string().max(200).optional(),
  nameFamily: z.string().max(200).optional(),
  gender: z.nativeEnum(AdministrativeGender, { required_error: 'required' }),
  birthYearOnly: z.boolean(),
  birthYear: z.number().int().min(1900).max(CURRENT_YEAR).optional(),
  birthDate: z.string().optional(),
  phone: z.string().max(50).optional(),
  preferredLanguage: z.enum(['en', 'ar', 'prs']).optional(),
  addressOriginProvince: z.string().min(1, 'required'),
  addressOriginDistrict: z.string().min(1, 'required'),
  addressOriginVillage: z.string().max(200).optional(),
  addressCurrentProvince: z.string().optional(),
  addressCurrentDistrict: z.string().optional(),
  addressCurrentVillage: z.string().max(200).optional(),
  isNomadic: z.boolean().optional(),
  bloodGroup: z.string().optional(),
}).superRefine((val, ctx) => {
  if (val.birthYearOnly && !val.birthYear) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthYear'], message: 'required' })
  }
  if (!val.birthYearOnly && !val.birthDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthDate'], message: 'required' })
  }
})

// ── Component ───────────────────────────────────────────────────────────────

export function PatientEditModal({
  open,
  patient,
  patientId,
  onClose,
  onSaved,
}: PatientEditModalProps) {
  const t = useTranslations('registration')
  const locale = useLocale()
  const isRtl = locale === 'ar' || locale === 'prs'

  // ── Form state ──
  const [nameGiven, setNameGiven] = useState('')
  const [nameFather, setNameFather] = useState('')
  const [nameGrandfather, setNameGrandfather] = useState('')
  const [nameFamily, setNameFamily] = useState('')
  const [gender, setGender] = useState<AdministrativeGender | ''>('')
  const [birthYearOnly, setBirthYearOnly] = useState(true)
  const [birthYear, setBirthYear] = useState<string>('')
  const [birthDate, setBirthDate] = useState('')
  const [phone, setPhone] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState<'en' | 'ar' | 'prs'>('en')

  // Address
  const [addressOrigin, setAddressOrigin] = useState<AddressFields>(EMPTY_ADDRESS)
  const [addressCurrent, setAddressCurrent] = useState<AddressFields>(EMPTY_ADDRESS)
  const [sameAsOrigin, setSameAsOrigin] = useState(false)
  const [isNomadic, setIsNomadic] = useState(false)

  // Clinical
  const [bloodGroup, setBloodGroup] = useState<string>('Unknown')
  const [nationalId, setNationalId] = useState('')

  // UI state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Blood group is write-once: disabled after first save with a non-Unknown value
  const bloodGroupLocked =
    !!patient._ultranos.bloodGroup &&
    patient._ultranos.bloodGroup !== 'Unknown'

  const hasNationalId = !!patient._ultranos.nationalIdHash

  // ── Initialize form from patient when modal opens ──
  useEffect(() => {
    if (!open) return

    const ext = patient._ultranos

    setNameGiven(ext.nameGiven ?? patient.name?.[0]?.given?.[0] ?? '')
    setNameFather(ext.nameFather ?? '')
    setNameGrandfather(ext.nameGrandfather ?? '')
    setNameFamily(ext.nameFamily ?? '')
    setGender(patient.gender || '')
    setBirthYearOnly(patient.birthYearOnly)

    if (patient.birthYearOnly) {
      setBirthYear(ext.birthYear?.toString() ?? (patient.birthDate ?? ''))
      setBirthDate('')
    } else {
      setBirthDate(patient.birthDate ?? '')
      setBirthYear('')
    }

    const phoneTelecom = patient.telecom?.find((tc) => tc.system === 'phone')
    setPhone(phoneTelecom?.value ?? '')
    setPreferredLanguage(
      (ext.preferredLanguage as 'en' | 'ar' | 'prs') ?? 'en',
    )

    // Address origin
    if (ext.addressOrigin) {
      setAddressOrigin({
        province: ext.addressOrigin.province,
        district: ext.addressOrigin.district,
        village: ext.addressOrigin.village ?? '',
      })
    } else {
      setAddressOrigin(EMPTY_ADDRESS)
    }

    // Address current
    if (ext.addressCurrent) {
      // Check if current matches origin
      const originMatch =
        ext.addressOrigin &&
        ext.addressCurrent.province === ext.addressOrigin.province &&
        ext.addressCurrent.district === ext.addressOrigin.district &&
        (ext.addressCurrent.village ?? '') === (ext.addressOrigin.village ?? '')

      if (originMatch) {
        setSameAsOrigin(true)
        setAddressCurrent(EMPTY_ADDRESS)
      } else {
        setSameAsOrigin(false)
        setAddressCurrent({
          province: ext.addressCurrent.province,
          district: ext.addressCurrent.district,
          village: ext.addressCurrent.village ?? '',
        })
      }
    } else {
      setSameAsOrigin(false)
      setAddressCurrent(EMPTY_ADDRESS)
    }

    setIsNomadic(ext.isNomadic ?? false)
    setBloodGroup(ext.bloodGroup ?? 'Unknown')
    setNationalId('') // Raw national ID is never stored; field starts empty for entry

    // Reset UI state
    setFieldErrors({})
    setSubmitError('')
    setSubmitting(false)
  }, [open, patient])

  // ── Validate ──

  const validate = useCallback((): boolean => {
    const result = PatientEditSchema.safeParse({
      nameGiven,
      nameFather: nameFather || undefined,
      nameGrandfather: nameGrandfather || undefined,
      nameFamily: nameFamily || undefined,
      gender: gender || undefined,
      birthYearOnly,
      birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
      birthDate: birthDate || undefined,
      phone: phone || undefined,
      preferredLanguage: preferredLanguage || undefined,
      addressOriginProvince: addressOrigin.province,
      addressOriginDistrict: addressOrigin.district,
      addressOriginVillage: addressOrigin.village || undefined,
      addressCurrentProvince: addressCurrent.province || undefined,
      addressCurrentDistrict: addressCurrent.district || undefined,
      addressCurrentVillage: addressCurrent.village || undefined,
      isNomadic,
      bloodGroup: bloodGroup || undefined,
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
    birthYear, birthDate, phone, preferredLanguage, addressOrigin,
    addressCurrent, isNomadic, bloodGroup, t,
  ])

  // ── Save handler ──

  const handleSave = useCallback(async () => {
    setSubmitError('')
    if (!validate()) return

    setSubmitting(true)

    try {
      // Compute nameLocal from patronymic chain
      const nameLocal = [nameGiven, nameFather, nameGrandfather, nameFamily]
        .filter(Boolean)
        .join(' ')

      // Build payload with only the changed fields
      // Resolve current address: same as origin, or separate entry
      const resolvedCurrent = sameAsOrigin
        ? { province: addressOrigin.province, district: addressOrigin.district, village: addressOrigin.village }
        : addressCurrent

      const payload: Record<string, unknown> = {
        patientId,
        lastKnownUpdate: patient.meta.lastUpdated,
        nameLocal,
        nameGiven,
        nameFather: nameFather || undefined,
        nameGrandfather: nameGrandfather || undefined,
        nameFamily: nameFamily || undefined,
        gender: gender || undefined,
        birthYearOnly,
        birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
        birthDate: birthDate || undefined,
        telecomPhone: phone || undefined,
        nationalId: nationalId || undefined,
        preferredLanguage: preferredLanguage || undefined,
        // Address fields — API expects flat field names, not nested objects
        addressProvinceOrigin: addressOrigin.province || undefined,
        addressDistrictOrigin: addressOrigin.district || undefined,
        addressVillageOrigin: addressOrigin.village || undefined,
        addressProvinceCurrent: resolvedCurrent.province || undefined,
        addressDistrictCurrent: resolvedCurrent.district || undefined,
        addressVillageCurrent: resolvedCurrent.village || undefined,
        isNomadic,
        bloodGroup: bloodGroupLocked ? undefined : (bloodGroup || undefined),
      }

      // POST to Hub API
      const url = new URL(getHubApiUrl())
      url.pathname = url.pathname.replace(/\/$/, '') + '/patient.update'

      const headers = await getAuthHeaders()
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify({ json: payload }),
      })

      const now = new Date().toISOString()

      if (!res.ok) {
        // Offline fallback: if fetch failed AND we are offline, do optimistic save
        if (!navigator.onLine) {
          const updatedPatient = buildUpdatedPatient(now)
          await db.patients.put(updatedPatient)

          auditPhiAccess(
            AuditAction.UPDATE,
            AuditResourceType.PATIENT,
            patientId,
            patientId,
            { phiAccess: 'profile_edit' },
          )

          onSaved(updatedPatient)
          onClose()
          return
        }

        throw new Error(`Update failed: ${res.status}`)
      }

      // The update endpoint returns only { id, resourceType, meta } —
      // use the server's lastUpdated timestamp for the optimistic patient.
      const body = await res.json() as {
        result: { data: { json: { meta: { lastUpdated: string } } } }
      }
      const serverTimestamp = body.result?.data?.json?.meta?.lastUpdated ?? now

      const updatedPatient = buildUpdatedPatient(serverTimestamp)

      // Update local Dexie cache with the full patient object
      try {
        await db.patients.put(updatedPatient)
      } catch {
        // Non-critical — state is updated in memory regardless
      }

      // Emit audit event
      auditPhiAccess(
        AuditAction.UPDATE,
        AuditResourceType.PATIENT,
        patientId,
        patientId,
        { phiAccess: 'profile_edit' },
      )

      onSaved(updatedPatient)
      onClose()
    } catch (err) {
      // Offline fallback on network error
      if (!navigator.onLine) {
        try {
          const now = new Date().toISOString()
          const updatedPatient = buildUpdatedPatient(now)
          await db.patients.put(updatedPatient)

          auditPhiAccess(
            AuditAction.UPDATE,
            AuditResourceType.PATIENT,
            patientId,
            patientId,
            { phiAccess: 'profile_edit' },
          )

          onSaved(updatedPatient)
          onClose()
          return
        } catch {
          // Fall through to generic error
        }
      }

      setSubmitError(
        err instanceof Error ? err.message : t('submitError'),
      )
    } finally {
      setSubmitting(false)
    }
  }, [
    validate, patientId, patient, nameGiven, nameFather, nameGrandfather, nameFamily,
    gender, birthYearOnly, birthYear, birthDate, phone, nationalId, preferredLanguage,
    addressOrigin, addressCurrent, sameAsOrigin, isNomadic, bloodGroup,
    bloodGroupLocked, onSaved, onClose, t,
  ])

  // ── Build an optimistic FhirPatient for offline saves ──

  const buildUpdatedPatient = useCallback(
    (now: string): FhirPatient => {
      const nameLocal = [nameGiven, nameFather, nameGrandfather, nameFamily]
        .filter(Boolean)
        .join(' ')

      const resolvedCurrentAddress = sameAsOrigin
        ? (addressOrigin.province
            ? { province: addressOrigin.province, district: addressOrigin.district, village: addressOrigin.village || undefined }
            : undefined)
        : (addressCurrent.province
            ? { province: addressCurrent.province, district: addressCurrent.district, village: addressCurrent.village || undefined }
            : undefined)

      return {
        ...patient,
        name: [{ given: nameGiven ? [nameGiven] : [], family: nameFamily || undefined, text: nameLocal }],
        gender: (gender as AdministrativeGender) || AdministrativeGender.UNKNOWN,
        birthDate: birthDate || (birthYear ? birthYear : undefined) as string | undefined,
        birthYearOnly,
        telecom: phone ? [{ system: 'phone' as const, value: phone }] : [],
        _ultranos: {
          ...patient._ultranos,
          nameLocal,
          nameGiven: nameGiven || undefined,
          nameFather: nameFather || undefined,
          nameGrandfather: nameGrandfather || undefined,
          nameFamily: nameFamily || undefined,
          birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
          preferredLanguage,
          addressOrigin: addressOrigin.province
            ? { province: addressOrigin.province, district: addressOrigin.district, village: addressOrigin.village || undefined }
            : undefined,
          addressCurrent: resolvedCurrentAddress,
          isNomadic,
          bloodGroup: bloodGroupLocked ? patient._ultranos.bloodGroup : (bloodGroup || undefined),
        },
        meta: { ...patient.meta, lastUpdated: now },
      }
    },
    [
      patient, nameGiven, nameFather, nameGrandfather, nameFamily, gender,
      birthYearOnly, birthYear, birthDate, phone, preferredLanguage,
      addressOrigin, addressCurrent, sameAsOrigin, isNomadic,
      bloodGroup, bloodGroupLocked,
    ],
  )

  // ── Escape key to close ──
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const inputClass = (error?: string) =>
    `w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
      error
        ? 'border-destructive focus:border-destructive focus:ring-destructive'
        : 'border-border focus:border-primary focus:ring-ring'
    }`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-patient-title"
    >
      <div className="flex w-full max-w-lg max-h-[90vh] flex-col rounded-xl bg-background shadow-xl sm:mx-4">
        {/* ── Sticky header ── */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2
            id="edit-patient-title"
            className="text-lg font-bold text-foreground"
          >
            {t('editPatientProfile')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary-300"
            aria-label={t('close')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Name section */}
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

          {/* Demographics section */}
          <Card as="fieldset">
            <legend className="text-base font-bold text-foreground mb-4">
              {t('demographicsSection')}
            </legend>

            <div className="space-y-4">
              {/* National ID */}
              <div>
                <label
                  htmlFor="edit-national-id"
                  className="mb-1 block text-sm font-semibold text-foreground"
                >
                  {t('nationalIdLabel')}
                  <span className="ms-1 text-xs font-normal text-muted-foreground">
                    ({t('optional')})
                  </span>
                </label>
                {hasNationalId ? (
                  <p className="min-h-[44px] flex items-center rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {t('nationalId')} ••••••
                  </p>
                ) : (
                  <input
                    id="edit-national-id"
                    type="text"
                    inputMode="text"
                    maxLength={200}
                    className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder={t('nationalIdPlaceholder')}
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value)}
                  />
                )}
              </div>

              {/* Gender */}
              <div>
                <label
                  htmlFor="edit-gender"
                  className="mb-1 block text-sm font-semibold text-foreground"
                >
                  {t('gender')}
                  <span className="text-destructive ms-0.5" aria-hidden="true">*</span>
                </label>
                <select
                  id="edit-gender"
                  value={gender}
                  onChange={(e) =>
                    setGender(e.target.value as AdministrativeGender)
                  }
                  aria-invalid={!!fieldErrors.gender}
                  className={inputClass(fieldErrors.gender)}
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
                      htmlFor="edit-birth-year"
                      className="mb-1 block text-sm font-semibold text-foreground"
                    >
                      {t('birthYear')}
                      <span className="text-destructive ms-0.5" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="edit-birth-year"
                      type="number"
                      inputMode="numeric"
                      min={1900}
                      max={CURRENT_YEAR}
                      aria-invalid={!!fieldErrors.birthYear}
                      className={inputClass(fieldErrors.birthYear)}
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
                      htmlFor="edit-birth-date"
                      className="mb-1 block text-sm font-semibold text-foreground"
                    >
                      {t('birthDate')}
                      <span className="text-destructive ms-0.5" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="edit-birth-date"
                      type="date"
                      aria-invalid={!!fieldErrors.birthDate}
                      className={inputClass(fieldErrors.birthDate)}
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
                  htmlFor="edit-phone"
                  className="mb-1 block text-sm font-semibold text-foreground"
                >
                  {t('phone')}
                  <span className="ms-1 text-xs font-normal text-muted-foreground">
                    ({t('optional')})
                  </span>
                </label>
                <input
                  id="edit-phone"
                  type="tel"
                  dir="ltr"
                  inputMode="tel"
                  className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder={t('phonePlaceholder')}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              {/* Preferred language */}
              <div>
                <label
                  htmlFor="edit-preferred-language"
                  className="mb-1 block text-sm font-semibold text-foreground"
                >
                  {t('preferredLanguage')}
                  <span className="ms-1 text-xs font-normal text-muted-foreground">
                    ({t('optional')})
                  </span>
                </label>
                <select
                  id="edit-preferred-language"
                  value={preferredLanguage}
                  onChange={(e) =>
                    setPreferredLanguage(e.target.value as 'en' | 'ar' | 'prs')
                  }
                  className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
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

          {/* Blood group */}
          <Card as="fieldset">
            <legend className="text-base font-bold text-foreground mb-4">
              {t('clinicalSection')}
            </legend>

            <div>
              <label
                htmlFor="edit-blood-group"
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('bloodGroup')}
                <span className="ms-1 text-xs font-normal text-muted-foreground">
                  ({t('optional')})
                </span>
              </label>
              <select
                id="edit-blood-group"
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                disabled={bloodGroupLocked}
                aria-disabled={bloodGroupLocked}
                className={`w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring ${
                  bloodGroupLocked ? 'bg-muted text-muted-foreground cursor-not-allowed' : ''
                }`}
              >
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
              {bloodGroupLocked && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('bloodGroupLocked')}
                </p>
              )}
            </div>
          </Card>

          {/* Error banner */}
          {submitError && (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              {submitError}
            </div>
          )}
        </div>

        {/* ── Sticky footer ── */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">
          <Button variant="ghost" type="button" onClick={onClose} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleSave}
            disabled={submitting}
          >
            {submitting ? t('saving') : t('saveChanges')}
          </Button>
        </div>
      </div>
    </div>
  )
}
