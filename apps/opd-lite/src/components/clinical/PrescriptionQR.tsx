'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
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
  const t = useTranslations('qr')
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
        setError(t('payloadTooLarge', { bytes: byteLength }))
        return
      }
      setBundle(signed)
      onFinalized?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorSignFailed'))
    } finally {
      setSigning(false)
    }
  }, [prescriptions, privateKey, publicKey, onFinalized])

  if (bundle) {
    const qrData = JSON.stringify(bundle)

    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <h3 className="text-xl font-bold text-success">
          {t('finalized')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('scanDescription')}
        </p>
        <div
          data-testid="prescription-qr-code"
          className="rounded-xl border-2 border-border bg-background p-4"
        >
          <QRCodeSVG
            value={qrData}
            size={256}
            level="M"
            includeMargin
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t('tamperProof')}
        </p>
        <Button
          variant="outline"
          type="button"
          onClick={() => window.print()}
        >
          {t('print')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {error && (
        <div
          className="w-full rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3"
          role="alert"
        >
          <p className="text-sm font-semibold text-destructive">{error}</p>
        </div>
      )}
      <Button
        variant="primary"
        type="button"
        onClick={handleFinalize}
        disabled={prescriptions.length === 0 || signing}
      >
        {signing ? t('signing') : t('finalizeGenerate')}
      </Button>
    </div>
  )
}
