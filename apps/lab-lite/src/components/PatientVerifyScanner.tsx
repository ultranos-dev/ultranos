'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { VerifyPatientResult } from '@/lib/trpc'

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
 * Story 12.2 — AC 2, 5, 6
 */
export function PatientVerifyScanner({ onVerified, onError, token }: PatientVerifyScannerProps) {
  const scannerRef = useRef<HTMLDivElement>(null)
  const html5QrCodeRef = useRef<any>(null)
  const processingRef = useRef(false)
  const [scanning, setScanning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [verifiedResult, setVerifiedResult] = useState<VerifyPatientResult | null>(null)

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
        let patientId: string
        try {
          const payload = JSON.parse(decodedText) as { pid?: string; exp?: number }
          // Validate QR expiry if present
          if (payload.exp && Date.now() / 1000 > payload.exp) {
            throw new Error('Health Passport QR code has expired')
          }
          patientId = payload.pid ?? decodedText
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message.includes('expired')) {
            throw parseErr
          }
          // If not JSON, treat as raw patient ID
          patientId = decodedText
        }

        const { verifyPatient } = await import('@/lib/trpc')
        const result = await verifyPatient(patientId, 'QR_SCAN', token)
        setVerifiedResult(result)
      } catch (err) {
        onError(err instanceof Error ? err.message : 'QR verification failed')
        processingRef.current = false
      } finally {
        setLoading(false)
      }
    },
    [token, onError],
  )

  function handleConfirm() {
    if (verifiedResult) {
      onVerified(verifiedResult)
    }
  }

  function handleReset() {
    setVerifiedResult(null)
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
    } catch (err) {
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
          <h3 className="mb-3 text-sm font-semibold text-green-800">Patient Verified</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="font-medium text-neutral-600">First Name</dt>
            <dd className="text-neutral-900">{verifiedResult.firstName}</dd>
            <dt className="font-medium text-neutral-600">Age</dt>
            <dd className="text-neutral-900">{verifiedResult.age}</dd>
          </dl>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              Confirm Patient
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {!scanning && !loading && !verifiedResult && (
        <button
          type="button"
          onClick={startScanner}
          className="rounded-lg bg-primary-600 px-4 py-3 text-sm font-semibold text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          Scan Patient QR Code
        </button>
      )}

      {scanning && (
        <button
          type="button"
          onClick={async () => {
            if (html5QrCodeRef.current) {
              await html5QrCodeRef.current.stop().catch(() => {})
            }
            setScanning(false)
          }}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
        >
          Cancel Scan
        </button>
      )}
    </div>
  )
}
