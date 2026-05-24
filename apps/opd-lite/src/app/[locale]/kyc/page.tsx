'use client'

import { useEffect, useState, useCallback, type ChangeEvent } from 'react'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { extractKycFields, fileToBase64, type OcrResult } from '@/lib/ocr'
import { Button } from '@/components/ui/Button'
import {
  getKycUploadUrl,
  uploadToSignedUrl,
  submitKyc,
  getKycStatus,
  type KycDocument,
  type KycStatusResponse,
} from '@/lib/kyc-api'

type KycStep = 'upload' | 'review' | 'confirm' | 'submitted'

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
        setDoc((prev) => ({ ...prev, error: 'Only JPEG, PNG, or PDF files are allowed' }))
        return
      }

      // Validate file size (max 10MB)
      const MAX_FILE_SIZE = 10 * 1024 * 1024
      if (file.size === 0 || file.size > MAX_FILE_SIZE) {
        setDoc((prev) => ({ ...prev, error: file.size === 0 ? 'File is empty' : 'File exceeds 10MB limit' }))
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
                error: 'Auto-extraction unavailable — please enter fields manually',
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
              error: 'PDF detected — please enter fields manually',
            },
          }))
        }
      } catch {
        setDoc((prev) => ({
          ...prev,
          uploading: false,
          error: 'Upload failed — please try again',
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
        setSubmitError('Your session has expired. Please log in again to continue.')
      } else {
        setSubmitError('Submission failed — please try again')
      }
    } finally {
      setSubmitting(false)
    }
  }, [confirmed, submitting, practitionerId, registryNumber, licenseDoc, nationalIdDoc, reviewFields])

  if (!session || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-neutral-500" role="status" aria-label="Loading">
          Loading...
        </div>
      </main>
    )
  }

  // Rejection / Request More Info banners
  const rejectionReason = kycStatusData?.latestSubmission?.rejection_reason
  const adminMessage = kycStatusData?.latestSubmission?.admin_message
  const isRejected = kycStatusData?.kycStatus === 'REJECTED'
  const isRequestMoreInfo = kycStatusData?.kycStatus === 'REQUEST_MORE_INFO'

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold text-neutral-900">
        KYC Document Verification
      </h1>
      <p className="mb-6 text-neutral-600">
        Submit your professional documents for account verification.
      </p>

      {/* Rejection banner */}
      {isRejected && rejectionReason && step !== 'submitted' && (
        <div
          className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
          role="alert"
          data-testid="rejection-banner"
        >
          <p className="font-semibold">Previous submission was rejected</p>
          <p className="mt-1 text-sm">{rejectionReason}</p>
          <p className="mt-2 text-sm">Please update your documents and re-submit.</p>
        </div>
      )}

      {/* Request more info banner */}
      {isRequestMoreInfo && adminMessage && step !== 'submitted' && (
        <div
          className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800"
          role="alert"
          data-testid="info-request-banner"
        >
          <p className="font-semibold">Additional information requested</p>
          <p className="mt-1 text-sm">{adminMessage}</p>
        </div>
      )}

      {/* Step indicator */}
      {step !== 'submitted' && (
        <div className="mb-8 flex gap-2" aria-label="Progress steps">
          {(['upload', 'review', 'confirm'] as const).map((s, i) => (
            <div
              key={s}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                step === s
                  ? 'bg-blue-600 text-white'
                  : (['upload', 'review', 'confirm'] as const).indexOf(step) > i
                    ? 'bg-green-100 text-green-700'
                    : 'bg-neutral-100 text-neutral-400'
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>
      )}

      {/* Step 1: Document Upload */}
      {step === 'upload' && (
        <div className="space-y-6">
          <DocumentUploadZone
            label="Medical License"
            docType="MEDICAL_LICENSE"
            state={licenseDoc}
            onFileSelect={(e) => handleFileSelect('MEDICAL_LICENSE', e)}
          />

          <DocumentUploadZone
            label="National ID"
            docType="NATIONAL_ID"
            state={nationalIdDoc}
            onFileSelect={(e) => handleFileSelect('NATIONAL_ID', e)}
          />

          <Button variant="primary" fullWidth disabled={!licenseDoc.uploaded || !nationalIdDoc.uploaded} onClick={handleProceedToReview}>
            Continue to Review
          </Button>
        </div>
      )}

      {/* Step 2: Review Extracted Fields */}
      {step === 'review' && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-neutral-800">
            Review Extracted Information
          </h2>
          <p className="text-sm text-neutral-500">
            Please verify the information extracted from your documents.
          </p>

          {Object.entries(reviewFields).map(([fieldName, value]) => {
            const ocrField = [
              ...(licenseDoc.ocrResult?.fields ?? []),
              ...(nationalIdDoc.ocrResult?.fields ?? []),
            ].find((f) => f.name === fieldName)
            const isLowConfidence = ocrField && ocrField.confidence < CONFIDENCE_THRESHOLD

            return (
              <div key={fieldName}>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  {formatFieldName(fieldName)}
                  {isLowConfidence && (
                    <span
                      className="ms-2 rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800"
                      data-testid={`low-confidence-${fieldName}`}
                    >
                      Please verify
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) =>
                    setReviewFields((prev) => ({ ...prev, [fieldName]: e.target.value }))
                  }
                  className={`w-full rounded-lg border px-3 py-2 text-neutral-900 ${
                    isLowConfidence
                      ? 'border-yellow-400 bg-yellow-50'
                      : 'border-neutral-300 bg-white'
                  }`}
                />
              </div>
            )
          })}

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Professional Registry Number
            </label>
            <input
              type="text"
              value={registryNumber}
              onChange={(e) => setRegistryNumber(e.target.value)}
              placeholder="e.g., REG-2026-00123"
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
            />
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep('upload')}>
              Back
            </Button>
            <Button variant="primary" className="flex-1" disabled={!registryNumber.trim()} onClick={() => setStep('confirm')}>
              Continue to Confirm
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm and Submit */}
      {step === 'confirm' && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-neutral-800">
            Confirm Submission
          </h2>

          <div className="rounded-xl ring-[0.65px] ring-gray-400/40 bg-neutral-50 p-4">
            <h3 className="mb-3 text-sm font-medium text-neutral-600">Summary</h3>
            <dl className="space-y-2 text-sm">
              {Object.entries(reviewFields).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <dt className="text-neutral-500">{formatFieldName(key)}</dt>
                  <dd className="font-medium text-neutral-900">{value || '—'}</dd>
                </div>
              ))}
              <div className="flex justify-between">
                <dt className="text-neutral-500">Registry Number</dt>
                <dd className="font-medium text-neutral-900">{registryNumber}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Documents</dt>
                <dd className="font-medium text-neutral-900">
                  {[licenseDoc.uploaded && 'Medical License', nationalIdDoc.uploaded && 'National ID']
                    .filter(Boolean)
                    .join(', ')}
                </dd>
              </div>
            </dl>
          </div>

          <label className="flex items-start gap-3 rounded-xl ring-[0.65px] ring-gray-400/40 p-4">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300"
            />
            <span className="text-sm text-neutral-700">
              I confirm this information is accurate and the documents are genuine.
            </span>
          </label>

          {submitError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
              {submitError}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep('review')}>
              Back
            </Button>
            <Button variant="primary" className="flex-1" disabled={!confirmed || submitting} onClick={handleSubmit}>
              {submitting ? 'Submitting...' : 'Submit for Verification'}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Submitted confirmation */}
      {step === 'submitted' && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center" data-testid="kyc-submitted">
          <div className="mb-4 text-4xl">&#10003;</div>
          <h2 className="mb-2 text-xl font-semibold text-green-800">
            Pending Verification
          </h2>
          <p className="text-green-700">
            We will notify you within 3 business days.
          </p>
          <p className="mt-4 text-sm text-green-600">
            You will be able to access clinical features once your account is verified.
          </p>
        </div>
      )}
    </main>
  )
}

/** Document upload zone component */
function DocumentUploadZone({
  label,
  docType,
  state,
  onFileSelect,
}: {
  label: string
  docType: string
  state: DocumentState
  onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div
      className="rounded-lg border-2 border-dashed border-neutral-300 p-6 text-center transition-colors hover:border-blue-400"
      data-testid={`upload-zone-${docType}`}
    >
      <p className="mb-2 text-sm font-medium text-neutral-700">{label}</p>

      {state.uploading && (
        <p className="text-sm text-blue-600" role="status">Uploading...</p>
      )}

      {state.ocrLoading && (
        <p className="text-sm text-blue-600" role="status">Extracting fields...</p>
      )}

      {state.uploaded && !state.ocrLoading && (
        <p className="text-sm text-green-600">
          &#10003; {state.file?.name ?? 'Uploaded'}
        </p>
      )}

      {state.error && (
        <p className="text-sm text-red-600" role="alert">{state.error}</p>
      )}

      {!state.uploading && !state.uploaded && !state.ocrLoading && (
        <>
          <p className="mb-3 text-xs text-neutral-500">
            JPEG, PNG, or PDF — max 10MB
          </p>
          <label className="cursor-pointer rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
            Select File
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
        <p className="mt-2 text-xs text-amber-600">
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
