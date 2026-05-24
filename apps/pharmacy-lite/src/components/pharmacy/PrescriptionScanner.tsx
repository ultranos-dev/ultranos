'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import {
  checkPrescriptionStatus,
  completePrescription,
  type PrescriptionStatusResult,
} from '@/lib/prescription-status-client'
import type { SignedPrescriptionBundle } from '@/lib/prescription-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export type ScanState =
  | { phase: 'idle' }
  | { phase: 'scanning' }
  | { phase: 'checking'; prescriptionId: string }
  | { phase: 'result'; result: PrescriptionStatusResult; additionalCount?: number }
  | { phase: 'offline' }
  | { phase: 'error'; message: string }
  | { phase: 'dispensing'; prescriptionId: string }
  | { phase: 'dispensed'; prescriptionId: string }

/** Request timeout for Hub API calls (15 seconds) */
const HUB_REQUEST_TIMEOUT_MS = 15_000

/**
 * P8: Robust offline/network-failure detection.
 * Checks for TypeError (fetch failures), navigator.onLine, and common gateway errors.
 */
function isOfflineError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  if (err instanceof TypeError) return true
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('aborted')
  }
  return false
}

interface PrescriptionScannerProps {
  onDispensed?: (prescriptionId: string) => void
}

/**
 * Parses a scanned QR payload into prescription IDs.
 * The QR contains a SignedPrescriptionBundle where `payload` is a JSON string
 * of CompactRx items, each with an `id` field.
 */
function parsePrescriptionIds(qrData: string): string[] {
  const bundle: SignedPrescriptionBundle = JSON.parse(qrData)
  const items: Array<{ id: string }> = JSON.parse(bundle.payload)
  return items.map((item) => item.id)
}

export function PrescriptionScanner({
  onDispensed,
}: PrescriptionScannerProps) {
  const [scanState, setScanState] = useState<ScanState>({ phase: 'idle' })
  const [manualInput, setManualInput] = useState('')
  const scannerRef = useRef<HTMLDivElement>(null)
  const html5QrRef = useRef<unknown>(null)

  // Ref to always access the latest handleQrData (avoids stale closure)
  const handleQrDataRef = useRef<((qrData: string) => Promise<void>) | null>(null)

  // Start camera scanner
  const startCameraScanner = useCallback(async () => {
    setScanState({ phase: 'scanning' })

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode('prescription-scanner-viewport')
      html5QrRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          scanner.stop().catch(() => {})
          html5QrRef.current = null
          handleQrDataRef.current?.(decodedText)
        },
        () => {
          // Scan failure frame — expected, keep scanning
        },
      )
    } catch {
      setScanState({
        phase: 'error',
        message: 'Camera access denied or unavailable. Use manual entry below.',
      })
    }
  }, [])

  // Stop camera scanner on unmount
  useEffect(() => {
    return () => {
      if (html5QrRef.current) {
        (html5QrRef.current as { stop: () => Promise<void> }).stop().catch(() => {})
      }
    }
  }, [])

  // Handle QR data (from camera or manual entry)
  const handleQrData = useCallback(async (qrData: string) => {
    const authToken = await useAuthSessionStore.getState().getAccessToken()
    if (!authToken) {
      setScanState({
        phase: 'error',
        message: 'Authentication required to verify prescriptions.',
      })
      return
    }

    let prescriptionIds: string[]
    try {
      prescriptionIds = parsePrescriptionIds(qrData)
    } catch {
      setScanState({
        phase: 'error',
        message: 'Invalid prescription QR code format.',
      })
      return
    }

    if (prescriptionIds.length === 0) {
      setScanState({
        phase: 'error',
        message: 'No prescriptions found in QR code.',
      })
      return
    }

    // Check status of ALL prescriptions in the bundle
    const id = prescriptionIds[0]!
    setScanState({ phase: 'checking', prescriptionId: id })

    try {
      // Check each prescription's status — block if any is FULFILLED or VOIDED
      const results: PrescriptionStatusResult[] = []
      for (const rxId of prescriptionIds) {
        const result = await checkPrescriptionStatus(
          rxId,
          authToken,
          AbortSignal.timeout(HUB_REQUEST_TIMEOUT_MS),
        )
        results.push(result)
      }

      // If any prescription is not AVAILABLE, show the first blocking result
      const blockedResult = results.find((r) => r.status !== 'AVAILABLE')
      if (blockedResult) {
        setScanState({ phase: 'result', result: blockedResult })
      } else {
        // All available — show the first result (UI shows the bundle context)
        const additionalCount = prescriptionIds.length > 1 ? prescriptionIds.length - 1 : undefined
        setScanState({ phase: 'result', result: results[0]!, additionalCount })
      }
    } catch (err) {
      // AC 4: If offline, warn the pharmacist
      if (isOfflineError(err)) {
        setScanState({ phase: 'offline' })
      } else {
        setScanState({
          phase: 'error',
          message: err instanceof Error ? err.message : 'Status check failed',
        })
      }
    }
  }, [])

  // Keep ref in sync with latest handleQrData
  useEffect(() => {
    handleQrDataRef.current = handleQrData
  }, [handleQrData])

  // Handle manual prescription ID entry
  const handleManualCheck = useCallback(async () => {
    const id = manualInput.trim()
    if (!id) return

    const authToken = await useAuthSessionStore.getState().getAccessToken()
    if (!authToken) {
      setScanState({
        phase: 'error',
        message: 'Authentication required to verify prescriptions.',
      })
      return
    }

    setScanState({ phase: 'checking', prescriptionId: id })

    try {
      const result = await checkPrescriptionStatus(
        id,
        authToken,
        AbortSignal.timeout(HUB_REQUEST_TIMEOUT_MS),
      )
      setScanState({ phase: 'result', result })
    } catch (err) {
      if (isOfflineError(err)) {
        setScanState({ phase: 'offline' })
      } else {
        setScanState({
          phase: 'error',
          message: err instanceof Error ? err.message : 'Status check failed',
        })
      }
    }
  }, [manualInput])

  // AC 5: Dispense / complete the prescription
  const handleDispense = useCallback(async (prescriptionId: string) => {
    const authToken = await useAuthSessionStore.getState().getAccessToken()
    if (!authToken) {
      setScanState({
        phase: 'error',
        message: 'Authentication required to dispense.',
      })
      return
    }

    setScanState({ phase: 'dispensing', prescriptionId })

    try {
      await completePrescription(
        prescriptionId,
        authToken,
        AbortSignal.timeout(HUB_REQUEST_TIMEOUT_MS),
      )
      setScanState({ phase: 'dispensed', prescriptionId })
      onDispensed?.(prescriptionId)
    } catch (err) {
      setScanState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Dispensing failed',
      })
    }
  }, [onDispensed])

  const handleReset = useCallback(() => {
    setScanState({ phase: 'idle' })
    setManualInput('')
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold text-neutral-900">
        Prescription Verification
      </h2>

      {/* Camera scanner viewport */}
      {scanState.phase === 'scanning' && (
        <div className="relative">
          <div
            id="prescription-scanner-viewport"
            ref={scannerRef}
            className="mx-auto max-w-sm overflow-hidden rounded-xl border-2 border-neutral-300"
            data-testid="scanner-viewport"
          />
          <Button
            variant="secondary"
            fullWidth
            className="mt-3"
            type="button"
            onClick={() => {
              if (html5QrRef.current) {
                (html5QrRef.current as { stop: () => Promise<void> }).stop().catch(() => {})
                html5QrRef.current = null
              }
              setScanState({ phase: 'idle' })
            }}
          >
            Stop Scanner
          </Button>
        </div>
      )}

      {/* Idle: show scan + manual entry options */}
      {scanState.phase === 'idle' && (
        <>
          <Button
            variant="primary"
            type="button"
            onClick={startCameraScanner}
            data-testid="start-scanner-btn"
          >
            Scan Prescription QR
          </Button>

          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-neutral-200" />
            <span className="text-xs text-neutral-400">or enter ID manually</span>
            <span className="h-px flex-1 bg-neutral-200" />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Prescription ID"
              className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
              data-testid="manual-prescription-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleManualCheck()
              }}
            />
            <Button
              variant="primary"
              type="button"
              onClick={handleManualCheck}
              disabled={!manualInput.trim()}
              data-testid="manual-check-btn"
            >
              Check
            </Button>
          </div>
        </>
      )}

      {/* Loading state */}
      {scanState.phase === 'checking' && (
        <div
          className="rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-center"
          role="status"
          data-testid="checking-status"
        >
          <p className="text-sm font-semibold text-neutral-600">
            Verifying prescription status...
          </p>
        </div>
      )}

      {/* AC 2, 3: Status result display */}
      {scanState.phase === 'result' && (
        <>
          {scanState.additionalCount != null && scanState.additionalCount > 0 && (
            <div
              className="rounded-lg border border-amber-300 bg-amber-50 p-3"
              role="alert"
              data-testid="multi-prescription-warning"
            >
              <p className="text-sm font-semibold text-amber-800">
                This QR contains {scanState.additionalCount + 1} prescriptions.
                Only the first is being verified. Scan individually for the rest.
              </p>
            </div>
          )}
          <StatusBanner
            result={scanState.result}
            onDispense={handleDispense}
            onReset={handleReset}
          />
        </>
      )}

      {/* AC 4: Offline warning */}
      {scanState.phase === 'offline' && (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 p-6"
          role="alert"
          data-testid="offline-warning"
        >
          <p className="text-lg font-bold text-amber-800">
            Status Cannot Be Verified
          </p>
          <p className="mt-2 text-sm text-amber-700">
            You are offline or the Hub is unreachable. The prescription status
            cannot be verified globally. Proceed with caution — this prescription
            may have already been fulfilled elsewhere.
          </p>
          <Button
            variant="warning"
            className="mt-4"
            type="button"
            onClick={handleReset}
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Error state */}
      {scanState.phase === 'error' && (
        <div
          className="rounded-lg border border-red-300 bg-red-50 p-6"
          role="alert"
          data-testid="scan-error"
        >
          <p className="text-sm font-bold text-red-800">{scanState.message}</p>
          <Button
            variant="warning"
            className="mt-4"
            type="button"
            onClick={handleReset}
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Dispensing in progress */}
      {scanState.phase === 'dispensing' && (
        <div
          className="rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-center"
          role="status"
          data-testid="dispensing-status"
        >
          <p className="text-sm font-semibold text-neutral-600">
            Recording fulfillment...
          </p>
        </div>
      )}

      {/* Dispensed confirmation */}
      {scanState.phase === 'dispensed' && (
        <div
          className="rounded-lg border border-green-300 bg-green-50 p-6"
          role="status"
          data-testid="dispensed-confirmation"
        >
          <p className="text-lg font-bold text-green-800">
            Prescription Dispensed
          </p>
          <p className="mt-2 text-sm text-green-700">
            This prescription has been marked as fulfilled on the global system.
          </p>
          <Button
            variant="primary"
            type="button"
            onClick={handleReset}
          >
            Scan Next
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * AC 2, 3: Status banner — green for AVAILABLE, red for FULFILLED/VOIDED.
 * Blocks the dispense button if status is not AVAILABLE.
 */
function StatusBanner({
  result,
  onDispense,
  onReset,
}: {
  result: PrescriptionStatusResult
  onDispense: (id: string) => void
  onReset: () => void
}) {
  const isAuthenticated = useAuthSessionStore((s) => s.session !== null)
  if (result.status === 'AVAILABLE') {
    return (
      <div
        className="rounded-lg border-2 border-green-400 bg-green-50 p-6"
        role="status"
        data-testid="status-available"
      >
        <p className="text-lg font-bold text-green-800">
          Prescription Valid
        </p>
        <p className="mt-1 text-sm text-green-700">
          {result.medicationDisplay}
        </p>
        <p className="mt-1 text-xs text-green-600">
          Prescribed: {new Date(result.authoredOn).toLocaleDateString()}
        </p>
        <div className="mt-4 flex gap-3">
          <Button
            variant="primary"
            type="button"
            onClick={() => onDispense(result.prescriptionId)}
            disabled={!isAuthenticated}
            data-testid="dispense-btn"
          >
            Dispense
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={onReset}
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  // FULFILLED or VOIDED — block fulfillment
  const isFulfilled = result.status === 'FULFILLED'
  return (
    <div
      className="rounded-lg border-2 border-red-400 bg-red-50 p-6"
      role="alert"
      data-testid={isFulfilled ? 'status-fulfilled' : 'status-voided'}
    >
      <p className="text-lg font-bold text-red-800">
        {isFulfilled ? 'Already Fulfilled' : 'Prescription Voided'}
      </p>
      <p className="mt-1 text-sm text-red-700">
        {result.medicationDisplay}
      </p>
      {isFulfilled && result.dispensedAt && (
        <p className="mt-1 text-xs text-red-600">
          Dispensed: {new Date(result.dispensedAt).toLocaleDateString()}
        </p>
      )}
      <p className="mt-3 text-sm font-semibold text-red-800">
        This prescription cannot be dispensed.
      </p>
      <Button
        variant="secondary"
        disabled
        className="mt-4 cursor-not-allowed"
        type="button"
        onClick={onReset}
        data-testid="dispense-btn-blocked"
      >
        Dispense Blocked
      </Button>
      <Button
        variant="secondary"
        className="ms-3 mt-4"
        type="button"
        onClick={onReset}
      >
        Scan Another
      </Button>
    </div>
  )
}
