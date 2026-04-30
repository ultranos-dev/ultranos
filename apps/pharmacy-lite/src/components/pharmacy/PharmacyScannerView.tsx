'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  verifyPrescriptionQr,
  fetchAndCachePractitionerKey,
  type VerificationResult,
  type VerifiedPrescription,
} from '@/lib/prescription-verify'
import { useFulfillmentStore } from '@/stores/fulfillment-store'

type ViewPhase =
  | { step: 'idle' }
  | { step: 'scanning' }
  | { step: 'verifying' }
  | { step: 'result'; result: VerificationResult; rawQr: string }
  | { step: 'error'; message: string }

interface PharmacyScannerViewProps {
  authToken?: string
  hubBaseUrl?: string
  onNavigateToReview?: () => void
}

export function PharmacyScannerView({
  authToken,
  hubBaseUrl,
  onNavigateToReview,
}: PharmacyScannerViewProps) {
  const [phase, setPhase] = useState<ViewPhase>({ step: 'idle' })
  const [pasteInput, setPasteInput] = useState('')
  const scannerRef = useRef<HTMLDivElement>(null)
  const html5QrRef = useRef<unknown>(null)
  const processingRef = useRef(false)
  const { loadPrescriptions } = useFulfillmentStore()

  // Verify QR data (from camera or paste)
  const handleVerify = useCallback(async (qrData: string) => {
    setPhase({ step: 'verifying' })

    const result = await verifyPrescriptionQr(qrData)
    setPhase({ step: 'result', result, rawQr: qrData })
  }, [])

  // Start camera-based QR scanner
  const startCameraScanner = useCallback(async () => {
    setPhase({ step: 'scanning' })

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode('pharmacy-scanner-viewport')
      html5QrRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          if (processingRef.current) return
          processingRef.current = true
          scanner.stop().catch(() => {})
          html5QrRef.current = null
          // Haptic feedback on successful scan
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate(200)
          }
          handleVerify(decodedText)
        },
        () => {
          // Scan failure frame — expected, keep scanning
        },
      )
    } catch {
      setPhase({
        step: 'error',
        message: 'Camera access denied or unavailable. Use manual entry below.',
      })
    }
  }, [handleVerify])

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      if (html5QrRef.current) {
        (html5QrRef.current as { stop: () => Promise<void> }).stop().catch(() => {})
      }
    }
  }, [])

  // Handle manual paste + verify
  const handlePasteVerify = useCallback(() => {
    const data = pasteInput.trim()
    if (!data) return
    handleVerify(data)
  }, [pasteInput, handleVerify])

  // Fetch clinician key from Hub and re-verify
  const handleFetchKey = useCallback(async (rawQr: string) => {
    if (!authToken || !hubBaseUrl) return

    try {
      // Extract pub key from QR
      const bundle = JSON.parse(rawQr) as { pub: string }
      await fetchAndCachePractitionerKey(bundle.pub, hubBaseUrl, authToken)
      // Reset processingRef so the scanner can be used again after re-verification
      processingRef.current = false
      // Re-verify now that key is cached
      handleVerify(rawQr)
    } catch {
      setPhase({ step: 'error', message: 'Failed to fetch clinician key from Hub.' })
    }
  }, [authToken, hubBaseUrl, handleVerify])

  // Load into fulfillment store and navigate
  const handleProceedToReview = useCallback(
    (prescriptions: VerifiedPrescription[], practitionerName?: string) => {
      loadPrescriptions(prescriptions, practitionerName)
      onNavigateToReview?.()
    },
    [loadPrescriptions, onNavigateToReview],
  )

  const handleReset = useCallback(() => {
    processingRef.current = false
    setPhase({ step: 'idle' })
    setPasteInput('')
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold text-neutral-900">
        Pharmacy Prescription Scanner
      </h2>

      {/* Camera scanner viewport */}
      {phase.step === 'scanning' && (
        <div className="relative">
          <div
            id="pharmacy-scanner-viewport"
            ref={scannerRef}
            className="mx-auto max-w-sm overflow-hidden rounded-xl border-2 border-neutral-300"
            data-testid="scanner-viewport"
          />
          <button
            type="button"
            onClick={() => {
              if (html5QrRef.current) {
                (html5QrRef.current as { stop: () => Promise<void> }).stop().catch(() => {})
                html5QrRef.current = null
              }
              setPhase({ step: 'idle' })
            }}
            className="mt-3 w-full rounded-md bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
          >
            Stop Scanner
          </button>
        </div>
      )}

      {/* Idle: show scan + manual entry options */}
      {phase.step === 'idle' && (
        <>
          <button
            type="button"
            onClick={startCameraScanner}
            className="rounded-md bg-primary-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-primary-700"
            data-testid="start-scanner-btn"
          >
            Scan Prescription QR
          </button>

          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-neutral-200" />
            <span className="text-xs text-neutral-400">or paste QR data</span>
            <span className="h-px flex-1 bg-neutral-200" />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={pasteInput}
              onChange={(e) => setPasteInput(e.target.value)}
              placeholder="Paste QR payload"
              className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
              data-testid="qr-paste-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePasteVerify()
              }}
            />
            <button
              type="button"
              onClick={handlePasteVerify}
              disabled={!pasteInput.trim()}
              className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              data-testid="verify-btn"
            >
              Verify
            </button>
          </div>
        </>
      )}

      {/* Verifying state */}
      {phase.step === 'verifying' && (
        <div
          className="rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-center"
          role="status"
          data-testid="verifying-status"
        >
          <p className="text-sm font-semibold text-neutral-600">
            Verifying prescription signature...
          </p>
        </div>
      )}

      {/* Result states */}
      {phase.step === 'result' && (
        <ResultDisplay
          result={phase.result}
          rawQr={phase.rawQr}
          onProceedToReview={handleProceedToReview}
          onFetchKey={handleFetchKey}
          onReset={handleReset}
          authToken={authToken}
          hubBaseUrl={hubBaseUrl}
        />
      )}

      {/* Error state */}
      {phase.step === 'error' && (
        <div
          className="rounded-lg border border-red-300 bg-red-50 p-6"
          role="alert"
          data-testid="scan-error"
        >
          <p className="text-sm font-bold text-red-800">{phase.message}</p>
          <button
            type="button"
            onClick={handleReset}
            className="mt-3 rounded-md bg-red-200 px-4 py-2 text-sm font-semibold text-red-800"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  )
}

function ResultDisplay({
  result,
  rawQr,
  onProceedToReview,
  onFetchKey,
  onReset,
  authToken,
  hubBaseUrl,
}: {
  result: VerificationResult
  rawQr: string
  onProceedToReview: (rx: VerifiedPrescription[], name?: string) => void
  onFetchKey: (rawQr: string) => void
  onReset: () => void
  authToken?: string
  hubBaseUrl?: string
}) {
  switch (result.status) {
    case 'verified':
      return (
        <div
          className="rounded-lg border-2 border-green-400 bg-green-50 p-6"
          role="status"
          data-testid="verification-success"
        >
          <p className="text-lg font-bold text-green-800">
            Verification Successful
          </p>
          {result.practitionerName && (
            <p className="mt-1 text-sm text-green-700">
              Prescribed by: {result.practitionerName}
            </p>
          )}
          <div className="mt-4 space-y-2">
            {result.prescriptions.map((rx) => (
              <div
                key={rx.id}
                className="rounded-md border border-green-200 bg-white p-3"
                data-testid={`rx-item-${rx.id}`}
              >
                <p className="font-semibold text-neutral-900">{rx.medN}</p>
                <p className="text-sm text-neutral-600">
                  {rx.dos.qty} {rx.dos.unit}
                  {rx.dos.freqN ? ` × ${rx.dos.freqN}` : rx.dos.freq ? ` ${rx.dos.freq}` : ''}
                  {rx.dos.perU ? `/${rx.dos.perU}` : ''}
                  {' — '}{rx.dur} days
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => onProceedToReview(result.prescriptions, result.practitionerName)}
              className="rounded-md bg-green-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-green-700"
              data-testid="proceed-to-review-btn"
            >
              Proceed to Fulfillment
            </button>
            <button
              type="button"
              onClick={onReset}
              className="rounded-md bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
            >
              Scan Another
            </button>
          </div>
        </div>
      )

    case 'invalid_signature':
      return (
        <div
          className="rounded-lg border-2 border-red-500 bg-red-100 p-6"
          role="alert"
          data-testid="fraud-warning"
        >
          <p className="text-lg font-bold text-red-900">
            ⚠ Fraud Warning
          </p>
          <p className="mt-2 text-sm font-semibold text-red-800">
            This prescription has an INVALID cryptographic signature. It may have
            been tampered with or was not issued by an authorized clinician.
          </p>
          <p className="mt-2 text-sm text-red-700">
            DO NOT dispense medication based on this prescription.
            Report this incident to your supervisor immediately.
          </p>
          <button
            type="button"
            onClick={onReset}
            className="mt-4 rounded-md bg-red-300 px-4 py-2 text-sm font-semibold text-red-900"
          >
            Dismiss
          </button>
        </div>
      )

    case 'expired':
      return (
        <div
          className="rounded-lg border-2 border-amber-400 bg-amber-50 p-6"
          role="alert"
          data-testid="expired-warning"
        >
          <p className="text-lg font-bold text-amber-800">
            Prescription Expired
          </p>
          <p className="mt-2 text-sm text-amber-700">
            This prescription expired on{' '}
            {new Date(result.expiry).toLocaleDateString()}.
            It cannot be fulfilled.
          </p>
          <button
            type="button"
            onClick={onReset}
            className="mt-4 rounded-md bg-amber-200 px-4 py-2 text-sm font-semibold text-amber-800"
          >
            Scan Another
          </button>
        </div>
      )

    case 'unknown_clinician':
      return (
        <div
          className="rounded-lg border-2 border-amber-400 bg-amber-50 p-6"
          role="alert"
          data-testid="unknown-clinician-warning"
        >
          <p className="text-lg font-bold text-amber-800">
            Unknown Clinician
          </p>
          <p className="mt-2 text-sm text-amber-700">
            The prescription signature is valid, but the signing clinician is not
            in the local trusted registry.
          </p>
          {result.fallbackAvailable && authToken && hubBaseUrl && (
            <button
              type="button"
              onClick={() => onFetchKey(rawQr)}
              className="mt-3 rounded-md bg-amber-300 px-4 py-2 text-sm font-semibold text-amber-800"
              data-testid="fetch-key-btn"
            >
              Look Up on Hub
            </button>
          )}
          <button
            type="button"
            onClick={onReset}
            className="ms-3 mt-3 rounded-md bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
          >
            Cancel
          </button>
        </div>
      )

    case 'parse_error':
      return (
        <div
          className="rounded-lg border border-red-300 bg-red-50 p-6"
          role="alert"
          data-testid="scan-error"
        >
          <p className="text-sm font-bold text-red-800">{result.message}</p>
          <button
            type="button"
            onClick={onReset}
            className="mt-3 rounded-md bg-red-200 px-4 py-2 text-sm font-semibold text-red-800"
          >
            Try Again
          </button>
        </div>
      )
  }
}
