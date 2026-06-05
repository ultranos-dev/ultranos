'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Check, X } from '@ultranos/ui-kit/icons'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getHubApiUrl } from '@/lib/trpc'
import {
  extractPrescriptionFields,
  fileToBase64,
  type PrescriptionOcrField,
} from '@/lib/ocr'

type Phase =
  | 'capture'
  | 'processing'
  | 'review'
  | 'submitting'
  | 'success'
  | 'error'

interface FormFields {
  medicationName: string
  dosage: string
  frequency: string
  prescriberName: string
  prescriptionDate: string
}

const EMPTY_FIELDS: FormFields = {
  medicationName: '',
  dosage: '',
  frequency: '',
  prescriberName: '',
  prescriptionDate: '',
}

export default function PaperRxPage() {
  const [phase, setPhase] = useState<Phase>('capture')
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS)
  const [confidenceScores, setConfidenceScores] = useState<Record<string, number>>({})
  const [capturedImage, setCapturedImage] = useState<File | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [isManualMode, setIsManualMode] = useState(false)
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null)
  const [videoReady, setVideoReady] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Clean up webcam and abort in-flight OCR on unmount
  useEffect(() => {
    return () => {
      if (webcamStream) {
        webcamStream.getTracks().forEach((t) => t.stop())
      }
      abortControllerRef.current?.abort()
    }
  }, [webcamStream])

  const startWebcam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      setWebcamStream(stream)
      setVideoReady(false)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch {
      setErrorMessage('Camera access denied. Please use file upload instead.')
    }
  }, [])

  const handleVideoReady = useCallback(() => {
    setVideoReady(true)
  }, [])

  const processImage = useCallback(async (file: File) => {
    setPhase('processing')

    // Create a new abort controller for this OCR operation
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const base64 = await fileToBase64(file)
      setImageBase64(base64)
      const result = await extractPrescriptionFields(base64, { signal: controller.signal })

      if (controller.signal.aborted) return

      if (!result.success || result.error === 'OCR_UNAVAILABLE') {
        // AC #7: Fall back to manual entry
        setIsManualMode(true)
        setFields(EMPTY_FIELDS)
        setConfidenceScores({})
        setPhase('review')
        return
      }

      // Map extracted fields to form
      const extracted: FormFields = { ...EMPTY_FIELDS }
      const scores: Record<string, number> = {}
      for (const field of result.fields) {
        if (field.name in extracted) {
          extracted[field.name as keyof FormFields] = field.value
          scores[field.name] = field.confidence
        }
      }
      setFields(extracted)
      setConfidenceScores(scores)
      setIsManualMode(false)
      setPhase('review')
    } catch (err) {
      if (controller.signal.aborted) return
      setIsManualMode(true)
      setFields(EMPTY_FIELDS)
      setConfidenceScores({})
      if (err instanceof Error && err.message.includes('too large')) {
        setErrorMessage(err.message)
      }
      setPhase('review')
    }
  }, [])

  const captureFromWebcam = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current

    // Guard: ensure video has loaded dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setErrorMessage('Camera not ready yet. Please wait a moment and try again.')
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(
      async (blob) => {
        if (!blob) return
        const file = new File([blob], 'prescription.jpg', { type: 'image/jpeg' })
        setCapturedImage(file)
        // Stop webcam
        webcamStream?.getTracks().forEach((t) => t.stop())
        setWebcamStream(null)
        // Process OCR
        await processImage(file)
      },
      'image/jpeg',
      0.9,
    )
  }, [webcamStream, processImage])

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      setCapturedImage(file)
      await processImage(file)
    },
    [processImage],
  )

  const handleFieldChange = (key: keyof FormFields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async () => {
    // Validate required fields
    if (!fields.medicationName || !fields.dosage || !fields.frequency || !fields.prescriberName || !fields.prescriptionDate) {
      setErrorMessage('All fields are required.')
      return
    }
    if (!capturedImage) {
      setErrorMessage('Prescription image is required.')
      return
    }

    setPhase('submitting')
    setErrorMessage('')

    try {
      const token = await useAuthSessionStore.getState().getAccessToken()
      if (!token) {
        setErrorMessage('Authentication required. Please log in again.')
        setPhase('review')
        return
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      }

      // Step 1: Get signed upload URL
      const uploadUrlRes = await fetch(
        `${getHubApiUrl()}/medication.getPaperRxUploadUrl`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ json: { contentType: capturedImage.type } }),
        },
      )

      if (!uploadUrlRes.ok) {
        throw new Error('Failed to get upload URL')
      }

      const uploadUrlData = await uploadUrlRes.json()
      const jsonPayload = uploadUrlData?.result?.data?.json
      if (!jsonPayload?.uploadUrl) {
        throw new Error('Invalid upload URL response')
      }
      const { uploadUrl, storageKey } = jsonPayload

      // Step 2: Upload image to signed URL
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': capturedImage.type },
        body: capturedImage,
      })

      if (!uploadRes.ok) {
        throw new Error('Failed to upload prescription image')
      }

      // Step 3: Create paper prescription record
      const createRes = await fetch(
        `${getHubApiUrl()}/medication.createPaperPrescription`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            json: {
              medicationName: fields.medicationName,
              dosage: fields.dosage,
              frequency: fields.frequency,
              prescriberName: fields.prescriberName,
              prescriptionDate: fields.prescriptionDate,
              ocrConfidenceScores: confidenceScores,
              imageStorageKey: storageKey,
            },
          }),
        },
      )

      if (!createRes.ok) {
        throw new Error('Failed to create paper prescription record')
      }

      setPhase('success')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Submission failed')
      setPhase('error')
    }
  }

  const resetForm = () => {
    setPhase('capture')
    setFields(EMPTY_FIELDS)
    setConfidenceScores({})
    setCapturedImage(null)
    setImageBase64(null)
    setErrorMessage('')
    setIsManualMode(false)
    setVideoReady(false)
  }

  const isLowConfidence = (fieldName: string): boolean => {
    const score = confidenceScores[fieldName]
    return score !== undefined && score < 0.85
  }

  return (
    <div className="space-y-6">
      {/* AC #9: Non-dismissible Manual Verification Required banner */}
      <div
        className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3"
        role="alert"
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <span className="text-destructive font-semibold text-sm">
            Manual Verification Required
          </span>
        </div>
        <p className="text-destructive/80 text-xs mt-1">
          Paper prescriptions cannot be digitally verified. The pharmacist takes
          full responsibility for verifying authenticity.
        </p>
      </div>

      {/* Drug interaction info banner — CLAUDE.md Rule #3 compliance */}
      <div
        className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2"
        role="status"
      >
        <p className="text-xs text-blue-800 font-medium">
          No drug interaction check performed — external prescriber
        </p>
      </div>

      {/* Phase: Capture */}
      {phase === 'capture' && (
        <div className="space-y-4">
          {/* Webcam viewfinder */}
          {webcamStream ? (
            <div className="space-y-3">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedData={handleVideoReady}
                className="w-full rounded-lg border border-border"
              />
              <canvas ref={canvasRef} className="hidden" />
              <Button
                variant="default"
                className="w-full"
                disabled={!videoReady}
                onClick={captureFromWebcam}
              >
                {videoReady ? 'Take Photo' : 'Camera loading...'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={startWebcam}
              >
                <span className="block text-lg font-medium text-foreground">
                  Open Camera
                </span>
                <span className="text-sm text-muted-foreground">
                  Use webcam to capture prescription
                </span>
              </Button>

              <div className="relative flex items-center gap-3">
                <div className="flex-1 border-t border-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 border-t border-border" />
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="block text-lg font-medium text-foreground">
                  Upload File
                </span>
                <span className="text-sm text-muted-foreground">
                  Select an image file (JPEG, PNG)
                </span>
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          )}

          {errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}
        </div>
      )}

      {/* Phase: Processing */}
      {phase === 'processing' && (
        <div className="flex flex-col items-center gap-3 py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          <p className="text-sm text-muted-foreground">
            Extracting prescription details...
          </p>
        </div>
      )}

      {/* Phase: Review & Confirm */}
      {phase === 'review' && (
        <div className="space-y-4">
          {isManualMode && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2">
              <p className="text-sm font-medium text-amber-800">
                Manual Entry Mode
              </p>
              <p className="text-xs text-amber-700">
                Auto-extraction unavailable. Please enter all fields manually.
              </p>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSubmit()
            }}
            className="space-y-4"
          >
            {(
              [
                ['medicationName', 'Medication Name'],
                ['dosage', 'Dosage'],
                ['frequency', 'Frequency'],
                ['prescriberName', 'Prescriber Name'],
                ['prescriptionDate', 'Date'],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label
                  htmlFor={key}
                  className="block text-sm font-medium text-foreground"
                >
                  {label}
                  {isLowConfidence(key) && (
                    <span className="ms-2 inline-block rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                      Please verify
                    </span>
                  )}
                </label>
                <input
                  id={key}
                  type="text"
                  value={fields[key]}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-ring ${
                    isLowConfidence(key)
                      ? 'border-yellow-400 bg-yellow-50'
                      : 'border-border bg-background text-foreground'
                  }`}
                />
              </div>
            ))}

            {errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}

            <Button
              variant="default"
              className="w-full"
              type="submit"
            >
              Confirm & Submit
            </Button>
          </form>
        </div>
      )}

      {/* Phase: Submitting */}
      {phase === 'submitting' && (
        <div className="flex flex-col items-center gap-3 py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          <p className="text-sm text-muted-foreground">
            Recording paper prescription...
          </p>
        </div>
      )}

      {/* Phase: Success */}
      {phase === 'success' && (
        <div className="space-y-4 text-center py-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <Check className="h-6 w-6 text-green-600" />
          </div>
          <p className="text-lg font-medium text-foreground">
            Paper prescription recorded as LEGACY_PAPER
          </p>
          <p className="text-sm text-muted-foreground">
            Manual verification flag applied. This prescription cannot be
            digitally invalidated.
          </p>
          <Button
            variant="outline"
            onClick={resetForm}
          >
            Scan Another
          </Button>
        </div>
      )}

      {/* Phase: Error */}
      {phase === 'error' && (
        <div className="space-y-4 text-center py-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <X className="h-6 w-6 text-destructive" />
          </div>
          <p className="text-lg font-medium text-destructive">Submission Failed</p>
          <p className="text-sm text-destructive">{errorMessage}</p>
          <Button
            variant="outline"
            onClick={() => setPhase('review')}
          >
            Try Again
          </Button>
        </div>
      )}
    </div>
  )
}
