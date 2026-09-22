'use client'

import { useReducer, useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { StepIndicator, type WizardStep as _BaseWizardStep } from '@/components/upload/StepIndicator'
import { OrderPickerStep } from '@/components/upload/OrderPickerStep'
import { PatientVerifyForm } from '@/components/PatientVerifyForm'
import { PatientVerifyScanner } from '@/components/PatientVerifyScanner'
import { RecentPatientsList } from '@/components/upload/RecentPatientsList'
import { PatientSearchInput } from '@/components/upload/PatientSearchInput'
import { ResultUpload } from '@/components/ResultUpload'
import { MetadataForm, type MetadataFormValues, type OcrStatus } from '@/components/MetadataForm'
import { ReviewStep } from '@/components/upload/ReviewStep'
import { addToQueue } from '@/lib/db'
import { analyzeUpload, type VerifyPatientResult } from '@/lib/trpc'
import { Button } from '@/components/ui/Button'
import { reportQueueAuditEvent } from '@/lib/audit-client'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useRecentPatients } from '@/hooks/useRecentPatients'
import type { PatientSearchItem } from '@/hooks/usePatientSearch'
import { wizardReducer, initialState } from './wizard'

// ── Page Component ──────────────────────────────────────

export default function UploadPage() {
  const router = useRouter()
  const t = useTranslations()
  const session = useAuthSessionStore((s) => s.session)
  const [state, dispatch] = useReducer(wizardReducer, initialState)
  const { patients: recentPatients, loading: recentPatientsLoading } = useRecentPatients(5)
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

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === 'Escape' && state.step !== 'SELECT_ORDER' && state.step !== 'VERIFY_PATIENT') {
        e.preventDefault()
        dispatch({ type: 'PREV_STEP' })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state.step])

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

  const handleOrderSelected = useCallback(
    (selection: { patient: { patientRef: string; patientFirstName: string; patientAge: number }; orderId: string }) => {
      dispatch({ type: 'SET_ORDER', payload: selection })
    },
    [],
  )

  const handleOrderSkip = useCallback(() => {
    dispatch({ type: 'GO_TO_STEP', payload: 'VERIFY_PATIENT' })
  }, [])

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
            ...(state.orderId != null ? { orderId: state.orderId } : {}),
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
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('upload.title')}</h1>

      <StepIndicator currentStep={state.step as _BaseWizardStep} />

      {/* Step 0: Select Order (optional branch entry — not part of linear chain) */}
      {state.step === 'SELECT_ORDER' && (
        <OrderPickerStep
          onOrderSelected={handleOrderSelected}
          onSkip={handleOrderSkip}
        />
      )}

      {/* Step 1: Verify Patient */}
      {state.step === 'VERIFY_PATIENT' && (
        <div className="flex flex-col gap-4">
          {verifyError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              {verifyError}
            </div>
          )}

          {/* Render patient already verified state */}
          {state.patient && (
            <div className="rounded-lg border border-success/30 bg-success/10 p-4">
              <h3 className="mb-3 text-sm font-semibold text-success">{t('verification.patientVerified')}</h3>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="font-medium text-muted-foreground">{t('verification.firstName')}</dt>
                <dd className="text-foreground">{state.patient.patientFirstName}</dd>
                <dt className="font-medium text-muted-foreground">{t('verification.age')}</dt>
                <dd className="text-foreground">{state.patient.patientAge}</dd>
              </dl>
            </div>
          )}

          {/* Render verification options only if not yet verified */}
          {!state.patient && (
            <>
              <RecentPatientsList patients={recentPatients} loading={recentPatientsLoading} onSelect={handleRecentPatientSelect} />

              {/* Search / Manual / QR toggle */}
              <div className="flex rounded-lg border border-border bg-muted/30 p-1">
                <button
                  type="button"
                  onClick={() => setVerifyMode('search')}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                    verifyMode === 'search'
                      ? 'bg-card text-primary shadow-sm'
                      : 'text-muted-foreground [@media(hover:hover)and(pointer:fine)]:hover:text-foreground'
                  }`}
                >
                  {t('verification.searchPatients')}
                </button>
                <button
                  type="button"
                  onClick={() => setVerifyMode('manual')}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                    verifyMode === 'manual'
                      ? 'bg-card text-primary shadow-sm'
                      : 'text-muted-foreground [@media(hover:hover)and(pointer:fine)]:hover:text-foreground'
                  }`}
                >
                  {t('upload.manualId')}
                </button>
                <button
                  type="button"
                  onClick={() => setVerifyMode('qr')}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                    verifyMode === 'qr'
                      ? 'bg-card text-primary shadow-sm'
                      : 'text-muted-foreground [@media(hover:hover)and(pointer:fine)]:hover:text-foreground'
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

      {/* Navigation buttons — shown only for the linear chain steps, not SELECT_ORDER/VERIFY_PATIENT/REVIEW_SUBMIT */}
      {state.step !== 'SELECT_ORDER' && state.step !== 'VERIFY_PATIENT' && state.step !== 'REVIEW_SUBMIT' && (
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
