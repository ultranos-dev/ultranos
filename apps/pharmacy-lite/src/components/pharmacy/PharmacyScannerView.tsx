'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  verifyPrescriptionQr,
  fetchAndCachePractitionerKey,
  type VerificationResult,
  type VerifiedPrescription,
} from '@/lib/prescription-verify'
import { useFulfillmentStore } from '@/stores/fulfillment-store'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getHubApiUrl } from '@/lib/trpc'

type ViewPhase =
  | { step: 'idle' }
  | { step: 'scanning' }
  | { step: 'verifying' }
  | { step: 'result'; result: VerificationResult; rawQr: string }
  | { step: 'error'; message: string }

interface PharmacyScannerViewProps {
  onNavigateToReview?: () => void
}

export function PharmacyScannerView({
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

  // Fetch clinician key from Hub and re-verify (used for unknown_clinician fallback)
  const handleFetchKey = useCallback(async (rawQr: string) => {
    try {
      const token = await useAuthSessionStore.getState().getAccessToken()
      const hubBaseUrl = getHubApiUrl()
      if (!token) return

      // Extract pub key from QR
      const bundle = JSON.parse(rawQr) as { pub: string }
      await fetchAndCachePractitionerKey(bundle.pub, hubBaseUrl, token)
      // Reset processingRef so the scanner can be used again after re-verification
      processingRef.current = false
      // Re-verify now that key is cached
      handleVerify(rawQr)
    } catch {
      setPhase({ step: 'error', message: 'Failed to fetch clinician key from Hub.' })
    }
  }, [handleVerify])

  // Re-run full verification (used for key_untrusted_offline retry — triggers revalidation path)
  const handleRetryVerify = useCallback((rawQr: string) => {
    processingRef.current = false
    handleVerify(rawQr)
  }, [handleVerify])

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
      <h2 className="text-xl font-bold text-foreground">
        Pharmacy Prescription Scanner
      </h2>

      {/* Camera scanner viewport */}
      {phase.step === 'scanning' && (
        <div className="relative">
          <div
            id="pharmacy-scanner-viewport"
            ref={scannerRef}
            className="mx-auto max-w-sm overflow-hidden rounded-xl border-2 border-border"
            data-testid="scanner-viewport"
          />
          <Button
            variant="secondary"
            className="w-full"
            type="button"
            onClick={() => {
              if (html5QrRef.current) {
                (html5QrRef.current as { stop: () => Promise<void> }).stop().catch(() => {})
                html5QrRef.current = null
              }
              setPhase({ step: 'idle' })
            }}
          >
            Stop Scanner
          </Button>
        </div>
      )}

      {/* Idle: show scan + manual entry options */}
      {phase.step === 'idle' && (
        <>
          <Button
            variant="default"
            type="button"
            onClick={startCameraScanner}
            data-testid="start-scanner-btn"
          >
            Scan Prescription QR
          </Button>

          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or paste QR data</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={pasteInput}
              onChange={(e) => setPasteInput(e.target.value)}
              placeholder="Paste QR payload"
              className="flex-1 rounded-md border border-border px-3 py-2 text-sm"
              data-testid="qr-paste-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePasteVerify()
              }}
            />
            <Button
              variant="default"
              type="button"
              onClick={handlePasteVerify}
              disabled={!pasteInput.trim()}
              data-testid="verify-btn"
            >
              Verify
            </Button>
          </div>
        </>
      )}

      {/* Verifying state */}
      {phase.step === 'verifying' && (
        <div
          className="rounded-2xl border border-border bg-muted p-6 text-center"
          role="status"
          data-testid="verifying-status"
        >
          <p className="text-sm font-semibold text-muted-foreground">
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
          onRetryVerify={handleRetryVerify}
          onReset={handleReset}
        />
      )}

      {/* Error state */}
      {phase.step === 'error' && (
        <div
          className="rounded-2xl border border-destructive/20 bg-destructive/10 p-6"
          role="alert"
          data-testid="scan-error"
        >
          <p className="text-sm font-bold text-destructive">{phase.message}</p>
          <Button
            variant="destructive"
            className="mt-3"
            type="button"
            onClick={handleReset}
          >
            Try Again
          </Button>
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
  onRetryVerify,
  onReset,
}: {
  result: VerificationResult
  rawQr: string
  onProceedToReview: (rx: VerifiedPrescription[], name?: string) => void
  onFetchKey: (rawQr: string) => void
  onRetryVerify: (rawQr: string) => void
  onReset: () => void
}) {
  const isAuthenticated = useAuthSessionStore((s) => s.session !== null)
  switch (result.status) {
    case 'verified':
      return (
        <div
          className="rounded-2xl border-2 border-success/20 bg-success/10 p-6"
          role="status"
          data-testid="verification-success"
        >
          <p className="text-lg font-bold text-success">
            Verification Successful
          </p>
          {result.practitionerName && (
            <p className="mt-1 text-sm text-success">
              Prescribed by: {result.practitionerName}
            </p>
          )}
          <div className="mt-4 space-y-2">
            {result.prescriptions.map((rx) => (
              <div
                key={rx.id}
                className="rounded-md border border-success/20 bg-card p-3"
                data-testid={`rx-item-${rx.id}`}
              >
                <p className="font-semibold text-foreground">{rx.medN}</p>
                <p className="text-sm text-muted-foreground">
                  {rx.dos.qty} {rx.dos.unit}
                  {rx.dos.freqN ? ` × ${rx.dos.freqN}` : rx.dos.freq ? ` ${rx.dos.freq}` : ''}
                  {rx.dos.perU ? `/${rx.dos.perU}` : ''}
                  {' — '}{rx.dur} days
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <Button
              variant="default"
              type="button"
              onClick={() => onProceedToReview(result.prescriptions, result.practitionerName)}
              data-testid="proceed-to-review-btn"
            >
              Proceed to Fulfillment
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={onReset}
            >
              Scan Another
            </Button>
          </div>
        </div>
      )

    case 'invalid_signature':
      return (
        <div
          className="rounded-2xl border-2 border-destructive/20 bg-destructive/10 p-6"
          role="alert"
          data-testid="fraud-warning"
        >
          <p className="text-lg font-bold text-destructive">
            ⚠ Fraud Warning
          </p>
          <p className="mt-2 text-sm font-semibold text-destructive">
            This prescription has an INVALID cryptographic signature. It may have
            been tampered with or was not issued by an authorized clinician.
          </p>
          <p className="mt-2 text-sm text-destructive">
            DO NOT dispense medication based on this prescription.
            Report this incident to your supervisor immediately.
          </p>
          <Button
            variant="destructive"
            className="mt-4"
            type="button"
            onClick={onReset}
          >
            Dismiss
          </Button>
        </div>
      )

    case 'expired':
      return (
        <div
          className="rounded-2xl border-2 border-warning/20 bg-warning/10 p-6"
          role="alert"
          data-testid="expired-warning"
        >
          <p className="text-lg font-bold text-warning">
            Prescription Expired
          </p>
          <p className="mt-2 text-sm text-warning">
            This prescription expired on{' '}
            {new Date(result.expiry).toLocaleDateString()}.
            It cannot be fulfilled.
          </p>
          <Button
            variant="outline"
            className="mt-4 border-warning text-warning hover:bg-warning/10"
            type="button"
            onClick={onReset}
          >
            Scan Another
          </Button>
        </div>
      )

    case 'unknown_clinician':
      return (
        <div
          className="rounded-2xl border-2 border-warning/20 bg-warning/10 p-6"
          role="alert"
          data-testid="unknown-clinician-warning"
        >
          <p className="text-lg font-bold text-warning">
            Unknown Clinician
          </p>
          <p className="mt-2 text-sm text-warning">
            The prescription signature is valid, but the signing clinician is not
            in the local trusted registry.
          </p>
          {result.fallbackAvailable && isAuthenticated && (
            <Button
              variant="outline"
              className="mt-3 border-warning text-warning hover:bg-warning/10"
              type="button"
              onClick={() => onFetchKey(rawQr)}
              data-testid="fetch-key-btn"
            >
              Look Up on Hub
            </Button>
          )}
          <Button
            variant="secondary"
            className="ms-3 mt-3"
            type="button"
            onClick={onReset}
          >
            Cancel
          </Button>
        </div>
      )

    case 'key_revoked':
      return (
        <div
          className="rounded-2xl border-2 border-destructive/20 bg-destructive/10 p-6"
          role="alert"
          data-testid="key-revoked-warning"
        >
          <p className="text-lg font-bold text-destructive">
            Prescriber Key Revoked
          </p>
          <p className="mt-2 text-sm font-semibold text-destructive">
            The prescriber&apos;s signing key has been revoked. This prescription
            cannot be verified and MUST NOT be dispensed.
          </p>
          <p className="mt-2 text-sm text-destructive">
            Contact the prescribing clinician or your supervisor for a new prescription.
          </p>
          <Button
            variant="destructive"
            className="mt-4"
            type="button"
            onClick={onReset}
          >
            Dismiss
          </Button>
        </div>
      )

    case 'key_untrusted_offline':
      return (
        <div
          className="rounded-2xl border-2 border-warning/20 bg-warning/10 p-6"
          role="alert"
          data-testid="key-untrusted-offline-warning"
        >
          <p className="text-lg font-bold text-warning">
            Prescriber Verification Unavailable
          </p>
          <p className="mt-2 text-sm font-semibold text-warning">
            Prescriber verification unavailable — Hub offline. Key was previously
            valid but has expired. Cannot verify current status.
          </p>
          <p className="mt-2 text-sm text-warning">
            Dispensing is blocked until the prescriber key can be re-verified.
          </p>
          <div className="mt-4 flex gap-3">
            <Button
              variant="outline"
              className="border-warning text-warning hover:bg-warning/10"
              type="button"
              onClick={() => onRetryVerify(rawQr)}
              data-testid="retry-revalidation-btn"
            >
              Wait and Retry
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={onReset}
              data-testid="cancel-offline-btn"
            >
              Cancel
            </Button>
          </div>
        </div>
      )

    case 'untrusted':
      return (
        <div
          className="rounded-2xl border-2 border-destructive/20 bg-destructive/10 p-6"
          role="alert"
          data-testid="untrusted-warning"
        >
          <p className="text-lg font-bold text-destructive">
            Verification Blocked
          </p>
          <p className="mt-2 text-sm text-destructive">{result.reason}</p>
          <Button
            variant="destructive"
            className="mt-4"
            type="button"
            onClick={onReset}
          >
            Dismiss
          </Button>
        </div>
      )

    case 'parse_error':
      return (
        <div
          className="rounded-2xl border border-destructive/20 bg-destructive/10 p-6"
          role="alert"
          data-testid="scan-error"
        >
          <p className="text-sm font-bold text-destructive">{result.message}</p>
          <Button
            variant="destructive"
            className="mt-3"
            type="button"
            onClick={onReset}
          >
            Try Again
          </Button>
        </div>
      )
  }
}
