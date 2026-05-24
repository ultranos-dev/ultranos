'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { VerifyPatientResult } from '@/lib/trpc'
import { verifyQrOffline, cacheVerifiedPatient, getCachedPatient } from '@/lib/offline-verify'
import type { QrPayload } from '@/lib/offline-verify'
import { Button } from '@/components/ui/Button'
import { OfflineVerificationBadge } from './OfflineVerificationBadge'
import { OnlineStatusIndicator } from './OnlineStatusIndicator'

type VerificationSource = 'online' | 'offline' | 'cached'

interface PatientVerifyScannerProps {
  onVerified: (result: VerifyPatientResult) => void
  onError: (message: string) => void
  token: string
}

/**
 * QR-based patient identity verification scanner.
 * Extracts patient identifier from Health Passport QR payload and
 * submits to lab.verifyPatient endpoint.
 * Shows a verification card (firstName + age) before confirming.
 *
 * Supports offline path: when navigator.onLine is false, performs
 * local Ed25519 signature verification using cached practitioner keys,
 * then checks the Dexie patient cache for display data.
 *
 * Story 12.2 — AC 2, 5, 6
 */
export function PatientVerifyScanner({ onVerified, onError, token }: PatientVerifyScannerProps) {
  const scannerRef = useRef<HTMLDivElement>(null)
  const html5QrCodeRef = useRef<any>(null)
  const processingRef = useRef(false)
  const [scanning, setScanning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [verifiedResult, setVerifiedResult] = useState<VerifyPatientResult | null>(null)
  const [verificationSource, setVerificationSource] = useState<VerificationSource>('online')
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleScanSuccess = useCallback(
    async (decodedText: string) => {
      // Guard against duplicate scan callbacks firing before stop() completes
      if (processingRef.current) return
      processingRef.current = true

      if (html5QrCodeRef.current) {
        try {
          await html5QrCodeRef.current.stop()
        } catch {
          // Scanner may already be stopped
        }
      }
      setScanning(false)
      setLoading(true)

      try {
        // Parse Health Passport QR payload: { pid, iat, exp, v, sig? }
        let payload: QrPayload | null = null
        let patientId: string

        try {
          const parsed = JSON.parse(decodedText) as Partial<QrPayload>
          patientId = parsed.pid ?? decodedText

          if (parsed.pid && parsed.iat && parsed.exp && parsed.sig) {
            payload = parsed as QrPayload
          }

          // Validate QR expiry if present
          if (parsed.exp && Date.now() / 1000 > parsed.exp) {
            throw new Error('Health Passport QR code has expired')
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message.includes('expired')) {
            throw parseErr
          }
          // If not JSON, treat as raw patient ID
          patientId = decodedText
        }

        if (!isOnline && payload) {
          // ── Offline path: verify signature locally ──
          const offlineResult = await verifyQrOffline(payload)

          if (!offlineResult.valid) {
            onError(offlineResult.reason ?? 'Offline verification failed')
            processingRef.current = false
            return
          }

          // Signature valid — check Dexie cache for patient display data
          const cached = await getCachedPatient(payload.pid)
          if (cached) {
            setVerifiedResult({
              firstName: cached.firstName,
              age: cached.age,
              patientRef: payload.pid,
            })
            setVerificationSource('offline')
          } else {
            onError('Patient identity not cached — cannot display details offline')
            processingRef.current = false
          }
        } else if (!isOnline && !payload) {
          // Offline but no signed payload — cannot verify
          onError('QR code has no signature — online connection required for verification')
          processingRef.current = false
        } else {
          // ── Online path: verify via Hub API ──
          const { verifyPatient } = await import('@/lib/trpc')
          const result = await verifyPatient(patientId!, 'QR_SCAN', token)
          setVerifiedResult(result)
          setVerificationSource('online')

          // Cache the verified patient for future offline use (Rule #7: firstName + age only)
          await cacheVerifiedPatient(result.patientRef, result.firstName, result.age)

          // TODO: Cache practitioner public key when server returns it in verification response.
          // This requires a Hub API change to include the signing key in lab.verifyPatient output.
        }
      } catch (err) {
        onError(err instanceof Error ? err.message : 'QR verification failed')
        processingRef.current = false
      } finally {
        setLoading(false)
      }
    },
    [token, onError, isOnline],
  )

  function handleConfirm() {
    if (verifiedResult) {
      onVerified(verifiedResult)
    }
  }

  function handleReset() {
    setVerifiedResult(null)
    setVerificationSource('online')
    processingRef.current = false
  }

  const startScanner = useCallback(async () => {
    if (!scannerRef.current) return

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode('qr-scanner-region')
      html5QrCodeRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        handleScanSuccess,
        () => {}, // Ignore scan failures (no QR in frame)
      )
      setScanning(true)
    } catch {
      onError('Camera access denied or unavailable')
    }
  }, [handleScanSuccess, onError])

  useEffect(() => {
    return () => {
      // Cleanup scanner on unmount
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(() => {})
      }
    }
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <OnlineStatusIndicator />

      <div
        id="qr-scanner-region"
        ref={scannerRef}
        className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100"
        style={{ minHeight: scanning ? 300 : 0 }}
      />

      {loading && (
        <p className="text-center text-sm text-neutral-500">Verifying patient...</p>
      )}

      {/* Verification card — confirm identity before proceeding (AC 5) */}
      {verifiedResult && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-green-800">Patient Verified</h3>
            <OfflineVerificationBadge source={verificationSource} />
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="font-medium text-neutral-600">First Name</dt>
            <dd className="text-neutral-900">{verifiedResult.firstName}</dd>
            <dt className="font-medium text-neutral-600">Age</dt>
            <dd className="text-neutral-900">{verifiedResult.age}</dd>
          </dl>
          <div className="mt-4 flex gap-3">
            <Button
              variant="primary"
              className="flex-1"
              type="button"
              onClick={handleConfirm}
            >
              Confirm Patient
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={handleReset}
            >
              Try Again
            </Button>
          </div>
        </div>
      )}

      {!scanning && !loading && !verifiedResult && (
        <Button
          variant="primary"
          type="button"
          onClick={startScanner}
        >
          Scan Patient QR Code
        </Button>
      )}

      {scanning && (
        <Button
          variant="outline"
          type="button"
          onClick={async () => {
            if (html5QrCodeRef.current) {
              await html5QrCodeRef.current.stop().catch(() => {})
            }
            setScanning(false)
          }}
        >
          Cancel Scan
        </Button>
      )}
    </div>
  )
}
