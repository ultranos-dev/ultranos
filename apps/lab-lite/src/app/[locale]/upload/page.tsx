'use client'

import { useReducer, useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { StepIndicator, type WizardStep } from '@/components/upload/StepIndicator'
import { PatientVerifyForm } from '@/components/PatientVerifyForm'
import { PatientVerifyScanner } from '@/components/PatientVerifyScanner'
import { RecentPatientsList } from '@/components/upload/RecentPatientsList'
import { PatientSearchInput } from '@/components/upload/PatientSearchInput'
import { ResultUpload } from '@/components/ResultUpload'
import { MetadataForm, type MetadataFormValues, type OcrStatus } from '@/components/MetadataForm'
import { ReviewStep } from '@/components/upload/ReviewStep'
import { addToQueue } from '@/lib/db'
import { analyzeUpload, type OcrAnalysisResult, type VerifyPatientResult } from '@/lib/trpc'
import { Button } from '@/components/ui/Button'
import { reportQueueAuditEvent } from '@/lib/audit-client'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useRecentPatients } from '@/hooks/useRecentPatients'
import type { PatientSearchItem } from '@/hooks/usePatientSearch'

// ── Wizard State ────────────────────────────────────────

interface WizardState {
  step: WizardStep
  patient: { patientRef: string; patientFirstName: string; patientAge: number } | null
  file: { file: File; fileName: string; fileType: string } | null
  ocrResult: OcrAnalysisResult | null
  ocrLoading: boolean
  metadata: MetadataFormValues | null
}

type WizardAction =
  | { type: 'SET_PATIENT'; payload: { patientRef: string; patientFirstName: string; patientAge: number } }
  | { type: 'SET_FILE'; payload: { file: File; fileName: string; fileType: string } }
  | { type: 'SET_OCR_LOADING'; payload: boolean }
  | { type: 'SET_OCR_RESULT'; payload: OcrAnalysisResult }
  | { type: 'SET_METADATA'; payload: MetadataFormValues }
  | { type: 'GO_TO_STEP'; payload: WizardStep }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }

const STEP_ORDER: WizardStep[] = ['VERIFY_PATIENT', 'UPLOAD_FILE', 'TAG_METADATA', 'REVIEW_SUBMIT']

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_PATIENT':
      return { ...state, patient: action.payload, step: 'UPLOAD_FILE', file: null, ocrResult: null, ocrLoading: false, metadata: null }
    case 'SET_FILE':
      return { ...state, file: action.payload }
    case 'SET_OCR_LOADING':
      return { ...state, ocrLoading: action.payload }
    case 'SET_OCR_RESULT':
      return { ...state, ocrResult: action.payload, ocrLoading: false }
    case 'SET_METADATA':
      return { ...state, metadata: action.payload, step: 'REVIEW_SUBMIT' }
    case 'GO_TO_STEP':
      return { ...state, step: action.payload }
    case 'NEXT_STEP': {
      const idx = STEP_ORDER.indexOf(state.step)
      if (idx < STEP_ORDER.length - 1) return { ...state, step: STEP_ORDER[idx + 1] }
      return state
    }
    case 'PREV_STEP': {
      const idx = STEP_ORDER.indexOf(state.step)
      if (idx > 0) return { ...state, step: STEP_ORDER[idx - 1] }
      return state
    }
    default:
      return state
  }
}

const initialState: WizardState = {
  step: 'VERIFY_PATIENT',
  patient: null,
  file: null,
  ocrResult: null,
  ocrLoading: false,
  metadata: null,
}

// ── Page Component ──────────────────────────────────────

export default function UploadPage() {
  const router = useRouter()
  const t = useTranslations()
  const session = useAuthSessionStore((s) => s.session)
  const [state, dispatch] = useReducer(wizardReducer, initialState)
  const recentPatients = useRecentPatients(5)
  const [verifyMode, setVerifyMode] = useState<'search' | 'manual' | 'qr'>('search')
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  // Get access token for API calls
  const [token, setToken] = useState<string>('')
  useEffect(() => {
    async function loadToken() {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()
        if (data.session?.access_token) setToken(data.session.access_token)
      } catch {
        // Token loading failure is handled by AuthGuard
      }
    }
    loadToken()
  }, [])

  // Browser back/navigation guard
  useEffect(() => {
    const hasData = state.patient !== null || state.file !== null || state.metadata !== null

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (hasData) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [state.patient, state.file, state.metadata])

  // ── Handlers ────────────────────────────────────────

  const handlePatientVerified = useCallback((result: VerifyPatientResult) => {
    dispatch({
      type: 'SET_PATIENT',
      payload: {
        patientRef: result.patientRef,
        patientFirstName: result.firstName,
        patientAge: result.age,
      },
    })
    setVerifyError(null)
  }, [])

  const handleVerifyError = useCallback((message: string) => {
    setVerifyError(message)
  }, [])

  const handleRecentPatientSelect = useCallback((patient: { patientId: string; firstName: string; age: number }) => {
    dispatch({
      type: 'SET_PATIENT',
      payload: {
        patientRef: patient.patientId,
        patientFirstName: patient.firstName,
        patientAge: patient.age,
      },
    })
    setVerifyError(null)
  }, [])

  const handleSearchPatientSelect = useCallback((patient: PatientSearchItem) => {
    dispatch({
      type: 'SET_PATIENT',
      payload: {
        patientRef: patient.id,
        patientFirstName: patient.firstName,
        patientAge: patient.age,
      },
    })
    setVerifyError(null)
  }, [])

  const handleFileSelected = useCallback(
    (file: File) => {
      dispatch({
        type: 'SET_FILE',
        payload: { file, fileName: file.name, fileType: file.type },
      })

      // Kick off OCR analysis asynchronously (non-blocking)
      if (token) {
        dispatch({ type: 'SET_OCR_LOADING', payload: true })
        const reader = new FileReader()
        reader.onload = async () => {
          const base64 = (reader.result as string).replace(/^data:[^;]+;base64,/, '')
          try {
            const result = await analyzeUpload(
              base64,
              file.type as 'application/pdf' | 'image/jpeg' | 'image/png',
              token,
            )
            dispatch({ type: 'SET_OCR_RESULT', payload: result })
          } catch {
            dispatch({
              type: 'SET_OCR_RESULT',
              payload: { suggestions: [], processingTimeMs: 0, available: false, provider: 'error' },
            })
          }
        }
        reader.readAsDataURL(file)
      }
    },
    [token],
  )

  const handleMetadataSubmit = useCallback((values: MetadataFormValues) => {
    dispatch({ type: 'SET_METADATA', payload: values })
  }, [])

  const handleConfirmSubmit = useCallback(async () => {
    if (!state.patient || !state.file || !state.metadata) return
    if (submittingRef.current) return
    submittingRef.current = true

    setSubmitting(true)
    setSubmitError(null)

    try {
      await addToQueue(
        {
          file: state.file.file,
          fileName: state.file.fileName,
          fileType: state.file.fileType,
          metadata: {
            loincCode: state.metadata.loincCode,
            loincDisplay: state.metadata.loincDisplay,
            collectionDate: state.metadata.collectionDate,
            ocrMetadataVerified: state.metadata.ocrMetadataVerified,
          },
          patientRef: state.patient.patientRef,
          patientFirstName: state.patient.patientFirstName,
          queuedAt: new Date().toISOString(),
          status: 'pending',
          retryCount: 0,
          lastAttemptAt: null,
        },
        (entryId, entry) => {
          reportQueueAuditEvent({
              action: 'QUEUE_ENTRY_CREATED',
              queueEntryId: entryId,
              testCategory: entry.metadata.loincDisplay,
              patientRef: entry.patientRef,
              timestamp: new Date().toISOString(),
              technicianId: session?.practitionerId,
            })
        },
      )

      router.push('/?uploaded=true')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('errors.queueFailed'))
    } finally {
      setSubmitting(false)
      submittingRef.current = false
    }
  }, [state, session, token, router, t])

  // ── Derived State ───────────────────────────────────

  const ocrStatus: OcrStatus | undefined =
    state.ocrLoading
      ? { loading: true, available: false }
      : state.ocrResult
        ? {
            loading: false,
            available: state.ocrResult.available,
            processingTimeMs: state.ocrResult.processingTimeMs,
          }
        : undefined

  // ── Render ──────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900">{t('upload.title')}</h1>
      </div>

      <StepIndicator currentStep={state.step} />

      {/* Step 1: Verify Patient */}
      {state.step === 'VERIFY_PATIENT' && (
        <div className="flex flex-col gap-4">
          {verifyError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
              {verifyError}
            </div>
          )}

          {/* Render patient already verified state */}
          {state.patient && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-green-800">{t('verification.patientVerified')}</h3>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="font-medium text-neutral-600">{t('verification.firstName')}</dt>
                <dd className="text-neutral-900">{state.patient.patientFirstName}</dd>
                <dt className="font-medium text-neutral-600">{t('verification.age')}</dt>
                <dd className="text-neutral-900">{state.patient.patientAge}</dd>
              </dl>
            </div>
          )}

          {/* Render verification options only if not yet verified */}
          {!state.patient && (
            <>
              <RecentPatientsList patients={recentPatients} onSelect={handleRecentPatientSelect} />

              {/* Search / Manual / QR toggle */}
              <div className="flex rounded-lg border border-neutral-200 bg-neutral-50 p-1">
                <button
                  type="button"
                  onClick={() => setVerifyMode('search')}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                    verifyMode === 'search'
                      ? 'bg-white text-primary-700 shadow-sm'
                      : 'text-neutral-500 [@media(hover:hover)and(pointer:fine)]:hover:text-neutral-700'
                  }`}
                >
                  {t('verification.searchPatients')}
                </button>
                <button
                  type="button"
                  onClick={() => setVerifyMode('manual')}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                    verifyMode === 'manual'
                      ? 'bg-white text-primary-700 shadow-sm'
                      : 'text-neutral-500 [@media(hover:hover)and(pointer:fine)]:hover:text-neutral-700'
                  }`}
                >
                  {t('upload.manualId')}
                </button>
                <button
                  type="button"
                  onClick={() => setVerifyMode('qr')}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                    verifyMode === 'qr'
                      ? 'bg-white text-primary-700 shadow-sm'
                      : 'text-neutral-500 [@media(hover:hover)and(pointer:fine)]:hover:text-neutral-700'
                  }`}
                >
                  {t('upload.qrScan')}
                </button>
              </div>

              {verifyMode === 'search' && (
                <PatientSearchInput token={token} onSelect={handleSearchPatientSelect} />
              )}
              {verifyMode === 'manual' && (
                <PatientVerifyForm
                  onVerified={handlePatientVerified}
                  onError={handleVerifyError}
                  token={token}
                />
              )}
              {verifyMode === 'qr' && (
                <PatientVerifyScanner
                  onVerified={handlePatientVerified}
                  onError={handleVerifyError}
                  token={token}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* Step 2: Upload File */}
      {state.step === 'UPLOAD_FILE' && (
        <div className="flex flex-col gap-4">
          <ResultUpload onFileSelected={handleFileSelected} />
        </div>
      )}

      {/* Step 3: Tag Metadata */}
      {state.step === 'TAG_METADATA' && (
        <div className="flex flex-col gap-4">
          <MetadataForm
            onSubmit={handleMetadataSubmit}
            ocrSuggestions={state.ocrResult?.suggestions}
            ocrStatus={ocrStatus}
          />
        </div>
      )}

      {/* Step 4: Review & Submit */}
      {state.step === 'REVIEW_SUBMIT' && state.patient && state.file && state.metadata && (
        <ReviewStep
          patientFirstName={state.patient.patientFirstName}
          patientAge={state.patient.patientAge}
          loincDisplay={state.metadata.loincDisplay}
          fileName={state.file.fileName}
          fileSize={state.file.file.size}
          collectionDate={state.metadata.collectionDate}
          onSubmit={handleConfirmSubmit}
          submitting={submitting}
          error={submitError}
        />
      )}

      {/* Navigation buttons */}
      {state.step !== 'VERIFY_PATIENT' && state.step !== 'REVIEW_SUBMIT' && (
        <div className="flex justify-between">
          <Button
            variant="outline"
            type="button"
            onClick={() => dispatch({ type: 'PREV_STEP' })}
            aria-label={t('upload.backAriaLabel')}
          >
            {t('upload.back')}
          </Button>

          {state.step === 'UPLOAD_FILE' && state.file && (
            <Button
              variant="primary"
              type="button"
              onClick={() => dispatch({ type: 'NEXT_STEP' })}
              aria-label={t('upload.nextAriaLabel')}
            >
              {t('upload.next')}
            </Button>
          )}
        </div>
      )}

      {/* Back button on review step */}
      {state.step === 'REVIEW_SUBMIT' && (
        <Button
          variant="outline"
          type="button"
          onClick={() => dispatch({ type: 'PREV_STEP' })}
          aria-label={t('upload.backAriaLabel')}
        >
          {t('upload.back')}
        </Button>
      )}
    </div>
  )
}
