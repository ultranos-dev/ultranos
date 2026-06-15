'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { putPatient } from '@/lib/db'
import {
  checkDuplicates,
  createPatient,
  type CheckDuplicatesResult,
  type CreatePatientInput,
} from '@/lib/trpc'
import { MpiResultModal } from './MpiResultModal'
import { CulturalFlagsEditor } from './CulturalFlagsEditor'
import type { PatientCulturalPreferences } from '@/lib/cultural-flags'

const INPUT_CLASS =
  'w-full rounded-lg border border-border px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500'

const currentYear = new Date().getFullYear()

type ConsentMethod = 'WRITTEN' | 'VERBAL_WITNESSED'

/**
 * Patient registration form for Lab Lite.
 * Captures minimal demographics + consent, runs MPI duplicate check,
 * creates patient via Hub API, and saves locally to Dexie.
 *
 * Task 10 — Patient Registration with MPI Duplicate Detection.
 */
export function PatientRegistrationForm() {
  const t = useTranslations('patients')
  const router = useRouter()

  // Form fields
  const [nameGiven, setNameGiven] = useState('')
  const [nameFather, setNameFather] = useState('')
  const [gender, setGender] = useState('')
  const [yearOnly, setYearOnly] = useState(true)
  const [birthYear, setBirthYear] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [phone, setPhone] = useState('')
  const [consentMethod, setConsentMethod] = useState<ConsentMethod>('WRITTEN')
  const [witnessName, setWitnessName] = useState('')

  // State
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [mpiResult, setMpiResult] = useState<CheckDuplicatesResult | null>(null)
  const [showCulturalPrefs, setShowCulturalPrefs] = useState(false)
  const [savedCulturalPrefs, setSavedCulturalPrefs] = useState<PatientCulturalPreferences | null>(null)

  const getToken = useCallback(async (): Promise<string> => {
    const supabase = getSupabaseBrowserClient()
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('Not authenticated')
    return token
  }, [])

  function validate(): string[] {
    const errs: string[] = []
    if (!nameGiven.trim()) errs.push(t('errorNameRequired'))
    if (!gender) errs.push(t('errorGenderRequired'))
    if (yearOnly) {
      if (!birthYear.trim()) {
        errs.push(t('errorBirthYearRequired'))
      } else {
        const y = Number(birthYear)
        if (y < 1900 || y > currentYear) errs.push(t('errorBirthYearRange'))
      }
    } else {
      if (!birthDate) errs.push(t('errorBirthDateRequired'))
    }
    if (consentMethod === 'VERBAL_WITNESSED' && !witnessName.trim()) {
      errs.push(t('errorWitnessRequired'))
    }
    return errs
  }

  function buildInput(proceedToken?: string): CreatePatientInput {
    return {
      nameLocal: nameGiven.trim(),
      nameGiven: nameGiven.trim() || undefined,
      nameFather: nameFather.trim() || undefined,
      gender,
      birthDate: yearOnly ? undefined : birthDate || undefined,
      birthYearOnly: yearOnly,
      birthYear: yearOnly ? Number(birthYear) : undefined,
      phone: phone.trim() || undefined,
      consent: {
        method: consentMethod,
        witnessedBy:
          consentMethod === 'VERBAL_WITNESSED' ? witnessName.trim() : undefined,
        language: 'en',
        version: '1.0',
      },
      mpiProceedToken: proceedToken,
    }
  }

  async function saveAndRedirect(patientId: string) {
    const patient = {
      id: patientId,
      resourceType: 'Patient',
      name: [{ given: [nameGiven.trim()], family: nameFather.trim() || undefined }],
      gender,
      ...(yearOnly
        ? {}
        : { birthDate }),
      _ultranos: {
        nameLocal: nameGiven.trim(),
        nameFather: nameFather.trim() || undefined,
        birthYearOnly: yearOnly,
        birthYear: yearOnly ? Number(birthYear) : undefined,
      },
      meta: { lastUpdated: new Date().toISOString(), versionId: '1' },
    }
    await putPatient(patient)
    router.push(`/upload?patientId=${patientId}`)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationErrors = validate()
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }
    setErrors([])
    setSubmitting(true)

    try {
      const token = await getToken()

      // MPI duplicate check
      const dupInput: Record<string, unknown> = {
        nameGiven: nameGiven.trim(),
        nameFather: nameFather.trim() || undefined,
        gender,
        birthYear: yearOnly ? Number(birthYear) : undefined,
        birthDate: yearOnly ? undefined : birthDate,
      }
      const result = await checkDuplicates(dupInput, token)

      if (result.decision === 'ALLOW') {
        const created = await createPatient(buildInput(), token)
        await saveAndRedirect(created.id)
        return
      }

      // WARN or BLOCK — show modal
      setMpiResult(result)
    } catch {
      setErrors([t('errorUnexpected')])
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMpiProceed(proceedToken?: string) {
    setMpiResult(null)
    setSubmitting(true)
    try {
      const token = await getToken()
      const created = await createPatient(buildInput(proceedToken), token)
      await saveAndRedirect(created.id)
    } catch {
      setErrors([t('errorUnexpected')])
    } finally {
      setSubmitting(false)
    }
  }

  function handleSelectExisting(patientId: string) {
    setMpiResult(null)
    router.push(`/upload?patientId=${patientId}`)
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Errors */}
        {errors.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            {errors.map((err) => (
              <p key={err} className="text-sm text-red-700">
                {err}
              </p>
            ))}
          </div>
        )}

        {/* Given Name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            {t('nameGiven')} *
          </label>
          <input
            type="text"
            maxLength={200}
            value={nameGiven}
            onChange={(e) => setNameGiven(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        {/* Father's Name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            {t('nameFather')}
          </label>
          <input
            type="text"
            maxLength={200}
            value={nameFather}
            onChange={(e) => setNameFather(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        {/* Gender */}
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            {t('gender')} *
          </label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">{t('selectGender')}</option>
            <option value="male">{t('male')}</option>
            <option value="female">{t('female')}</option>
            <option value="other">{t('other')}</option>
          </select>
        </div>

        {/* Birth Info */}
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            {t('birthInfo')} *
          </label>
          <div className="mb-2 flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={yearOnly}
                onChange={(e) => setYearOnly(e.target.checked)}
                className="rounded border-border"
              />
              {t('yearOnly')}
            </label>
          </div>
          {yearOnly ? (
            <input
              type="number"
              min={1900}
              max={currentYear}
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              placeholder="1990"
              className={INPUT_CLASS}
            />
          ) : (
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className={INPUT_CLASS}
            />
          )}
        </div>

        {/* Phone */}
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            {t('phone')}
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        {/* Consent */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-foreground">
            {t('consent')} *
          </legend>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="consent"
                value="WRITTEN"
                checked={consentMethod === 'WRITTEN'}
                onChange={() => setConsentMethod('WRITTEN')}
              />
              {t('consentWritten')}
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="consent"
                value="VERBAL_WITNESSED"
                checked={consentMethod === 'VERBAL_WITNESSED'}
                onChange={() => setConsentMethod('VERBAL_WITNESSED')}
              />
              {t('consentVerbal')}
            </label>
          </div>
          {consentMethod === 'VERBAL_WITNESSED' && (
            <div className="mt-2">
              <label className="mb-1 block text-sm text-muted-foreground">
                {t('witnessName')} *
              </label>
              <input
                type="text"
                value={witnessName}
                onChange={(e) => setWitnessName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          )}
        </fieldset>

        {/* Cultural Preferences — collapsible, optional (Story 45.6 Task 6) */}
        <details
          open={showCulturalPrefs}
          onToggle={(e) => setShowCulturalPrefs((e.target as HTMLDetailsElement).open)}
          data-testid="cultural-prefs-section"
        >
          <summary className="cursor-pointer text-sm font-medium text-indigo-700 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300">
            {t('culturalPreferences', { defaultMessage: 'Cultural Preferences (optional)' })}
          </summary>
          <div className="mt-3">
            <CulturalFlagsEditor
              patientRef=""
              existingPrefs={savedCulturalPrefs}
              techId=""
              hlcTimestamp=""
              onSave={(prefs) => setSavedCulturalPrefs(prefs)}
            />
          </div>
        </details>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
          >
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? t('registering') : t('registerPatient')}
          </Button>
        </div>
      </form>

      {/* MPI Duplicate Modal */}
      {mpiResult && (
        <MpiResultModal
          result={mpiResult}
          onProceed={handleMpiProceed}
          onSelectExisting={handleSelectExisting}
          onCancel={() => setMpiResult(null)}
        />
      )}
    </>
  )
}
