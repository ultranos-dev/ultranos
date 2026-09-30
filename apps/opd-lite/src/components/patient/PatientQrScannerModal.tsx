'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ultranos/ui-kit/components/ui/dialog'
import { QrCode } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import { parseHealthPassportQr } from '@/lib/health-passport-qr'

/** Unique DOM id the html5-qrcode camera view renders into. */
const SCANNER_REGION_ID = 'opd-patient-qr-scanner-region'

interface PatientQrScannerModalProps {
  open: boolean
  onClose: () => void
  /** Called with the decoded patient id (pid) from a valid Health Passport QR. */
  onScanned: (patientId: string) => void
}

/**
 * Camera QR scanner for a patient's Health Passport (Patient Lite mobile app).
 *
 * The identity QR carries `{ pid, iat, exp, v, sig? }` — never raw PHI. We read
 * the `pid` (patient id), reject an expired QR, and hand the id back to the
 * caller which routes to that patient. PHI safety: the decoded payload and pid
 * are never logged.
 */
export function PatientQrScannerModal({ open, onClose, onScanned }: PatientQrScannerModalProps) {
  const t = useTranslations('dashboard')
  const tCommon = useTranslations('common')
  // html5-qrcode instance (typed loosely — the lib ships its own types lazily).
  const html5QrCodeRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null)
  const processingRef = useRef(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const stopScanner = useCallback(async () => {
    const scanner = html5QrCodeRef.current
    html5QrCodeRef.current = null
    if (!scanner) return
    try {
      await scanner.stop()
    } catch {
      // Scanner may already be stopped.
    }
    try {
      scanner.clear()
    } catch {
      // Nothing to clear.
    }
  }, [])

  const handleScanSuccess = useCallback(
    async (decodedText: string) => {
      // Guard against duplicate frame callbacks firing before stop() resolves.
      if (processingRef.current) return
      processingRef.current = true
      await stopScanner()

      // Parse Health Passport QR: { pid, iat, exp, v, sig? }. Never log its content.
      const scan = parseHealthPassportQr(decodedText)
      if (!scan.ok) {
        setError(scan.reason === 'expired' ? t('qrExpired') : t('qrInvalid'))
        processingRef.current = false
        return
      }
      onScanned(scan.patientId)
    },
    [onScanned, stopScanner, t],
  )

  // Start the camera when the dialog opens; tear it down on close/unmount.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    processingRef.current = false
    setError('')
    setStarting(true)

    void (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        // Wait one frame so the portal-mounted scanner region exists in the DOM.
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
        if (cancelled || !document.getElementById(SCANNER_REGION_ID)) return

        const scanner = new Html5Qrcode(SCANNER_REGION_ID)
        html5QrCodeRef.current = scanner as unknown as typeof html5QrCodeRef.current
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text: string) => {
            void handleScanSuccess(text)
          },
          () => {
            // Ignore per-frame "no QR in view" callbacks.
          },
        )
        if (cancelled) await stopScanner()
      } catch {
        if (!cancelled) setError(t('qrCameraError'))
      } finally {
        if (!cancelled) setStarting(false)
      }
    })()

    return () => {
      cancelled = true
      void stopScanner()
    }
  }, [open, handleScanSuccess, stopScanner, t])

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" aria-hidden="true" />
            {t('scanQrTitle')}
          </DialogTitle>
          <DialogDescription>{t('scanQrSubtitle')}</DialogDescription>
        </DialogHeader>

        <div
          id={SCANNER_REGION_ID}
          className="aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted"
        />

        {starting && !error && (
          <p className="text-center text-sm text-muted-foreground">{t('qrStarting')}</p>
        )}
        {error && (
          <div
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" type="button" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
