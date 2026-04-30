'use client'

import { useState, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { FhirMedicationRequestZod } from '@ultranos/shared-types'
import { signPrescriptionBundle, type SignedPrescriptionBundle } from '@/lib/prescription-signing'

/** Safe QR byte limit — QR v40 at error correction M holds ~2,953 bytes; leave margin */
const QR_MAX_BYTES = 2500

interface PrescriptionQRProps {
  prescriptions: FhirMedicationRequestZod[]
  privateKey: Uint8Array
  publicKey: Uint8Array
  onFinalized?: () => void
}

export function PrescriptionQR({
  prescriptions,
  privateKey,
  publicKey,
  onFinalized,
}: PrescriptionQRProps) {
  const [bundle, setBundle] = useState<SignedPrescriptionBundle | null>(null)
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFinalize = useCallback(async () => {
    setSigning(true)
    setError(null)
    try {
      const signed = await signPrescriptionBundle(prescriptions, privateKey, publicKey)
      const qrData = JSON.stringify(signed)
      const byteLength = new TextEncoder().encode(qrData).length
      if (byteLength > QR_MAX_BYTES) {
        setError(
          `Prescription payload too large for QR code (${byteLength} bytes). ` +
          `Reduce to fewer prescriptions or remove notes.`,
        )
        return
      }
      setBundle(signed)
      onFinalized?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign prescription')
    } finally {
      setSigning(false)
    }
  }, [prescriptions, privateKey, publicKey, onFinalized])

  if (bundle) {
    const qrData = JSON.stringify(bundle)

    return (
      <div className="flex flex-col items-center gap-6 py-6">
        <h3 className="text-xl font-bold text-green-700">
          Prescription Finalized
        </h3>
        <p className="text-sm text-neutral-600">
          Patient can scan this code at any pharmacy to fulfill their prescription.
        </p>
        <div
          data-testid="prescription-qr-code"
          className="rounded-xl border-2 border-neutral-200 bg-white p-4"
        >
          <QRCodeSVG
            value={qrData}
            size={256}
            level="M"
            includeMargin
          />
        </div>
        <p className="text-xs text-neutral-400">
          Cryptographically signed — tamper-proof
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
        >
          Print
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {error && (
        <div
          className="w-full rounded-lg border border-red-300 bg-red-50 px-4 py-3"
          role="alert"
        >
          <p className="text-sm font-semibold text-red-800">{error}</p>
        </div>
      )}
      <button
        type="button"
        onClick={handleFinalize}
        disabled={prescriptions.length === 0 || signing}
        className="rounded-md bg-green-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
      >
        {signing ? 'Signing...' : 'Finalize & Generate QR'}
      </button>
    </div>
  )
}
