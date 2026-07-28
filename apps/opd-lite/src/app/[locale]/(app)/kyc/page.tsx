'use client'

import { Fragment, useEffect, useState, useCallback, type ChangeEvent } from 'react'
import { useTranslations } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { extractKycFields, fileToBase64, type OcrResult } from '@/lib/ocr'
import { Button } from '@/components/ui/Button'
import { buttonVariants } from '@ultranos/ui-kit/components/ui/button'
import { Skeleton } from '@ultranos/ui-kit/components/ui/skeleton'
import { Card } from '@/components/Card'
import { Alert } from '@ultranos/ui-kit/components/ui/alert'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { CircleCheck } from '@ultranos/ui-kit/icons'
import {
  getKycUploadUrl,
  uploadToSignedUrl,
  submitKyc,
  getKycStatus,
  type KycDocument,
  type KycStatusResponse,
} from '@/lib/kyc-api'

type KycStep = 'upload' | 'review' | 'confirm' | 'submitted'

const KYC_STEPS: { key: Exclude<KycStep, 'submitted'>; labelKey: string }[] = [
  { key: 'upload', labelKey: 'stepUpload' },
  { key: 'review', labelKey: 'stepReview' },
  { key: 'confirm', labelKey: 'stepConfirm' },
]

interface DocumentState {
  file: File | null
  storageKey: string
  uploading: boolean
  uploaded: boolean
  ocrResult: OcrResult | null
  ocrLoading: boolean
  error: string | null
}

const CONFIDENCE_THRESHOLD = 0.85

const INITIAL_DOC_STATE: DocumentState = {
  file: null,
  storageKey: '',
  uploading: false,
  uploaded: false,
  ocrResult: null,
  ocrLoading: false,
  error: null,
}

export default function KycPage() {
  const t = useTranslations('kyc')
  const session = useAuthSessionStore((s) => s.session)
  const [step, setStep] = useState<KycStep>('upload')
  const [licenseDoc, setLicenseDoc] = useState<DocumentState>(INITIAL_DOC_STATE)
  const [nationalIdDoc, setNationalIdDoc] = useState<DocumentState>(INITIAL_DOC_STATE)
  const [registryNumber, setRegistryNumber] = useState('')
  const [reviewFields, setReviewFields] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [kycStatusData, setKycStatusData] = useState<KycStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)

  // Redirect unauthenticated users
  useEffect(() => {
    if (!session) {
      window.location.href = '/login'
    }
  }, [session])

  // Load current KYC status (for re-submission flows)
  useEffect(() => {
    if (!session) return
    let cancelled = false

    async function load() {
      try {
        const status = await getKycStatus(session!.practitionerId)
        if (cancelled) return
        setKycStatusData(status)

        // If already submitted and pending, show submitted state
        if (status.kycStatus === 'PENDING_VERIFICATION' && status.latestSubmission?.status === 'PENDING') {
          setStep('submitted')
        }

        // Pre-populate registry number from previous submission
        if (status.latestSubmission?.registry_number) {
          setRegistryNumber(status.latestSubmission.registry_number)
        }
      } catch {
        // KYC status fetch failed — allow fresh submission
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [session])

  const practitionerId = session?.practitionerId ?? ''

  /** Handle file selection for a document type */
  const handleFileSelect = useCallback(
    async (docType: 'MEDICAL_LICENSE' | 'NATIONAL_ID', e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      const setDoc = docType === 'MEDICAL_LICENSE' ? setLicenseDoc : setNationalIdDoc

      // Validate file type
      if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
        setDoc((prev) => ({ ...prev, error: t('invalidFileType') }))
        return
      }

      // Validate file size (max 10MB)
      const MAX_FILE_SIZE = 10 * 1024 * 1024
      if (file.size === 0 || file.size > MAX_FILE_SIZE) {
        setDoc((prev) => ({ ...prev, error: file.size === 0 ? t('emptyFile') : t('fileTooLarge') }))
        return
      }

      setDoc((prev) => ({ ...prev, file, uploading: true, error: null }))

      try {
        // 1. Get signed upload URL
        const { uploadUrl, storageKey } = await getKycUploadUrl(practitionerId, docType, file.type)

        // 2. Upload file
        await uploadToSignedUrl(uploadUrl, file)

        setDoc((prev) => ({ ...prev, uploading: false, uploaded: true, storageKey }))

        // 3. Run OCR (only for images, not PDFs)
        if (file.type.startsWith('image/')) {
          setDoc((prev) => ({ ...prev, ocrLoading: true }))
          try {
            const base64 = await fileToBase64(file)
            const ocrResult = await extractKycFields(base64)
            setDoc((prev) => ({ ...prev, ocrResult, ocrLoading: false }))
          } catch {
            setDoc((prev) => ({
              ...prev,
              ocrLoading: false,
              ocrResult: {
                fields: [],
                success: false,
                error: t('ocrUnavailable'),
              },
            }))
          }
        } else {
          // PDF — no client-side OCR, manual entry required
          setDoc((prev) => ({
            ...prev,
            ocrResult: {
              fields: [],
              success: false,
              error: t('pdfManual'),
            },
          }))
        }
      } catch {
        setDoc((prev) => ({
          ...prev,
          uploading: false,
          error: t('uploadFailed'),
        }))
      }
    },
    [practitionerId],
  )

  /** Move from upload step to review step */
  const handleProceedToReview = useCallback(() => {
    // Build review fields from OCR results
    const fields: Record<string, string> = {}
    const allOcrFields = [
      ...(licenseDoc.ocrResult?.fields ?? []),
      ...(nationalIdDoc.ocrResult?.fields ?? []),
    ]

    for (const field of allOcrFields) {
      if (!fields[field.name]) {
        fields[field.name] = field.value
      }
    }

    // Ensure all expected fields exist (even if empty)
    for (const key of ['full_name', 'license_number', 'issuing_body', 'expiry_date']) {
      if (!fields[key]) fields[key] = ''
    }

    setReviewFields(fields)
    setStep('review')
  }, [licenseDoc.ocrResult, nationalIdDoc.ocrResult])

  /** Handle final submission */
  const handleSubmit = useCallback(async () => {
    if (!confirmed || submitting) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      const documents: KycDocument[] = []

      if (licenseDoc.uploaded) {
        documents.push({
          type: 'MEDICAL_LICENSE',
          storageKey: licenseDoc.storageKey,
          ocrResults: {
            fields: Object.entries(reviewFields).map(([name, value]) => ({
              name,
              value,
              confidence: licenseDoc.ocrResult?.fields.find((f) => f.name === name)?.confidence ?? 1.0,
            })),
          },
        })
      }

      if (nationalIdDoc.uploaded) {
        documents.push({
          type: 'NATIONAL_ID',
          storageKey: nationalIdDoc.storageKey,
          ocrResults: {
            fields: Object.entries(reviewFields).map(([name, value]) => ({
              name,
              value,
              confidence: nationalIdDoc.ocrResult?.fields.find((f) => f.name === name)?.confidence ?? 1.0,
            })),
          },
        })
      }

      await submitKyc(practitionerId, documents, registryNumber)
      setStep('submitted')
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message === 'Not authenticated') {
        setSubmitError(t('sessionExpired'))
      } else {
        setSubmitError(t('submissionFailed'))
      }
    } finally {
      setSubmitting(false)
    }
  }, [confirmed, submitting, practitionerId, registryNumber, licenseDoc, nationalIdDoc, reviewFields])

  if (!session || loading) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  // Rejection / Request More Info banners
  const rejectionReason = kycStatusData?.latestSubmission?.rejection_reason
  const adminMessage = kycStatusData?.latestSubmission?.admin_message
  const isRejected = kycStatusData?.kycStatus === 'REJECTED'
  const isRequestMoreInfo = kycStatusData?.kycStatus === 'REQUEST_MORE_INFO'

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      {/* Rejection banner */}
      {isRejected && rejectionReason && step !== 'submitted' && (
        <Alert
          variant="destructive"
          role="alert"
          data-testid="rejection-banner"
          title={t('rejectedHeading')}
        >
          <p className="text-sm">{rejectionReason}</p>
          <p className="mt-1 text-sm">{t('rejectedDetail')}</p>
        </Alert>
      )}

      {/* Request more info banner */}
      {isRequestMoreInfo && adminMessage && step !== 'submitted' && (
        <Alert
          variant="warning"
          role="alert"
          data-testid="info-request-banner"
          title={t('additionalInfoHeading')}
        >
          <p className="text-sm">{adminMessage}</p>
        </Alert>
      )}

      {/* Step progress indicator */}
      {step !== 'submitted' && (
        <div className="flex items-center" aria-label="Progress steps">
          {KYC_STEPS.map((s, i) => {
            const currentIndex = KYC_STEPS.findIndex((x) => x.key === step)
            const isDone = currentIndex > i
            const isActive = step === s.key
            return (
              <Fragment key={s.key}>
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : isDone
                          ? 'bg-success/20 text-success'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isDone ? <CircleCheck className="h-4 w-4" aria-hidden="true" /> : i + 1}
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      isActive ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {t(s.labelKey)}
                  </span>
                </div>
                {i < KYC_STEPS.length - 1 && (
                  <div className="mx-3 h-px flex-1 bg-border" />
                )}
              </Fragment>
            )
          })}
        </div>
      )}

      {/* Step 1: Document Upload */}
      {step === 'upload' && (
        <Card className="flex flex-col gap-4">
          <DocumentUploadZone
            label={t('medicalLicense')}
            docType="MEDICAL_LICENSE"
            state={licenseDoc}
            onFileSelect={(e) => handleFileSelect('MEDICAL_LICENSE', e)}
            fileHint={t('fileHint')}
            selectFileLabel={t('selectFile')}
            uploadingLabel={t('uploading')}
            extractingLabel={t('extracting')}
          />

          <DocumentUploadZone
            label={t('nationalId')}
            docType="NATIONAL_ID"
            state={nationalIdDoc}
            onFileSelect={(e) => handleFileSelect('NATIONAL_ID', e)}
            fileHint={t('fileHint')}
            selectFileLabel={t('selectFile')}
            uploadingLabel={t('uploading')}
            extractingLabel={t('extracting')}
          />

          <Button variant="primary" fullWidth disabled={!licenseDoc.uploaded || !nationalIdDoc.uploaded} onClick={handleProceedToReview}>
            {t('continueToReview')}
          </Button>
        </Card>
      )}

      {/* Step 2: Review Extracted Fields */}
      {step === 'review' && (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {t('reviewTitle')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('reviewDescription')}
            </p>
          </div>

          {Object.entries(reviewFields).map(([fieldName, value]) => {
            const ocrField = [
              ...(licenseDoc.ocrResult?.fields ?? []),
              ...(nationalIdDoc.ocrResult?.fields ?? []),
            ].find((f) => f.name === fieldName)
            const isLowConfidence = ocrField && ocrField.confidence < CONFIDENCE_THRESHOLD

            return (
              <div key={fieldName}>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  {formatFieldName(fieldName)}
                  {isLowConfidence && (
                    <span
                      className="ms-2 rounded bg-warning/20 px-2 py-0.5 text-xs text-warning"
                      data-testid={`low-confidence-${fieldName}`}
                    >
                      {t('pleaseVerify')}
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) =>
                    setReviewFields((prev) => ({ ...prev, [fieldName]: e.target.value }))
                  }
                  className={`w-full rounded-xl border px-3 py-2 text-foreground ${
                    isLowConfidence
                      ? 'border-warning/50 bg-warning/10'
                      : 'border-border bg-background'
                  }`}
                />
              </div>
            )
          })}

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              {t('registryNumber')}
            </label>
            <input
              type="text"
              value={registryNumber}
              onChange={(e) => setRegistryNumber(e.target.value)}
              placeholder={t('registryPlaceholder')}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground"
            />
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep('upload')}>
              {t('back')}
            </Button>
            <Button variant="primary" className="flex-1" disabled={!registryNumber.trim()} onClick={() => setStep('confirm')}>
              {t('continueToConfirm')}
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3: Confirm and Submit */}
      {step === 'confirm' && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-foreground">
            {t('confirmTitle')}
          </h2>

          <div className="rounded-xl bg-muted/40 p-4">
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">{t('summary')}</h3>
            <dl className="space-y-2 text-sm">
              {Object.entries(reviewFields).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <dt className="text-muted-foreground">{formatFieldName(key)}</dt>
                  <dd className="font-medium text-foreground">{value || '·'}</dd>
                </div>
              ))}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('registryLabel')}</dt>
                <dd className="font-medium text-foreground">{registryNumber}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('documents')}</dt>
                <dd className="font-medium text-foreground">
                  {[licenseDoc.uploaded && t('medicalLicense'), nationalIdDoc.uploaded && t('nationalId')]
                    .filter(Boolean)
                    .join(', ')}
                </dd>
              </div>
            </dl>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-muted/40 p-4">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border"
            />
            <span className="text-sm text-foreground">
              {t('confirmAccuracy')}
            </span>
          </label>

          {submitError && (
            <Alert variant="destructive" role="alert">
              {submitError}
            </Alert>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep('review')}>
              {t('back')}
            </Button>
            <Button variant="primary" className="flex-1" disabled={!confirmed || submitting} onClick={handleSubmit}>
              {submitting ? t('submitting') : t('submitForVerification')}
            </Button>
          </div>
        </Card>
      )}

      {/* Step 4: Submitted confirmation */}
      {step === 'submitted' && (
        <div
          data-testid="kyc-submitted"
          className="flex min-h-[18rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50"
        >
          <EmptyState
            icon={CircleCheck}
            title={t('pendingTitle')}
            description={`${t('pendingDetail')} ${t('pendingAccess')}`}
          />
        </div>
      )}
    </div>
  )
}

/** Document upload zone component */
function DocumentUploadZone({
  label,
  docType,
  state,
  onFileSelect,
  fileHint,
  selectFileLabel,
  uploadingLabel,
  extractingLabel,
}: {
  label: string
  docType: string
  state: DocumentState
  onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void
  fileHint: string
  selectFileLabel: string
  uploadingLabel: string
  extractingLabel: string
}) {
  return (
    <div
      className="rounded-xl border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary/50"
      data-testid={`upload-zone-${docType}`}
    >
      <p className="mb-2 text-sm font-medium text-foreground">{label}</p>

      {state.uploading && (
        <p className="text-sm text-primary" role="status">{uploadingLabel}</p>
      )}

      {state.ocrLoading && (
        <p className="text-sm text-primary" role="status">{extractingLabel}</p>
      )}

      {state.uploaded && !state.ocrLoading && (
        <p className="text-sm text-success">
          <CircleCheck className="inline-block h-4 w-4 me-1 align-[-2px]" aria-hidden="true" />
          {state.file?.name ?? uploadingLabel}
        </p>
      )}

      {state.error && (
        <p className="text-sm text-destructive" role="alert">{state.error}</p>
      )}

      {!state.uploading && !state.uploaded && !state.ocrLoading && (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            {fileHint}
          </p>
          <label className={`${buttonVariants({ variant: 'default' })} cursor-pointer`}>
            {selectFileLabel}
            <input
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={onFileSelect}
              className="hidden"
              data-testid={`file-input-${docType}`}
            />
          </label>
        </>
      )}

      {state.ocrResult && !state.ocrResult.success && (
        <p className="mt-2 text-xs text-warning">
          {state.ocrResult.error}
        </p>
      )}
    </div>
  )
}

/** Format snake_case field name to Title Case */
function formatFieldName(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
