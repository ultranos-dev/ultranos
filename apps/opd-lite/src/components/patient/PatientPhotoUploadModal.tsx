'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Camera, Upload, Trash2, User, Check, RotateCcw } from '@ultranos/ui-kit/icons'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@ultranos/ui-kit/components/ui/dialog'
import { Alert } from '@ultranos/ui-kit'
import { Button } from '@/components/ui/Button'
import { PhotoCropper, type PhotoCropperHandle } from '@/components/patient/PhotoCropper'
import { useWebcamCapture } from '@/hooks/useWebcamCapture'
import { uploadPatientPhoto, removePatientPhoto } from '@/lib/patient-photo-api'

const RAW_SIZE_LIMIT = 20 * 1024 * 1024

type Step = 'source' | 'camera' | 'crop' | 'uploading' | 'error'

interface Props {
  open: boolean
  patientId: string
  /** Storage key of the current photo, or null. Drives the Remove affordance. */
  currentPhotoKey: string | null
  /** Signed URL for the current photo (from the avatar), shown in the preview. */
  currentPhotoSrc?: string | null
  lastKnownUpdate: string
  onClose: () => void
  onUpdated: (photoKey: string | null, lastUpdated: string) => void
}

/** cropped data URL → Blob for multipart upload. */
function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',')
  const head = parts[0] ?? ''
  const b64 = parts[1] ?? ''
  const mime: string = /data:(.*?);base64/.exec(head)?.[1] ?? 'image/jpeg'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export function PatientPhotoUploadModal({
  open, patientId, currentPhotoKey, currentPhotoSrc, lastKnownUpdate, onClose, onUpdated,
}: Props) {
  const t = useTranslations('patientPhoto')
  const [step, setStep] = useState<Step>('source')
  const [rawDataUrl, setRawDataUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [online, setOnline] = useState(true)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cropperRef = useRef<PhotoCropperHandle>(null)
  const webcam = useWebcamCapture()

  // Reset to a clean state whenever the modal (re)opens.
  useEffect(() => {
    if (open) {
      setStep('source'); setRawDataUrl(null); setErrorMsg(''); setConfirmRemove(false)
      setOnline(navigator.onLine)
    }
  }, [open])

  // Track connectivity while open.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])

  // Attach the live stream to the <video> when the camera goes live; fall back to file on failure.
  useEffect(() => {
    if (step !== 'camera') return
    if (webcam.state.status === 'live' && videoRef.current) {
      videoRef.current.srcObject = webcam.state.stream
      void videoRef.current.play().catch(() => {})
    }
    if (webcam.state.status === 'unavailable') {
      setStep('source')
      fileInputRef.current?.click()
    }
  }, [step, webcam.state.status, webcam.state.stream])

  const close = useCallback(() => { webcam.stop(); onClose() }, [webcam, onClose])

  const onFilePicked = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > RAW_SIZE_LIMIT) { setErrorMsg(t('tooLarge')); setStep('error'); return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result
      if (typeof result === 'string') { setRawDataUrl(result); setStep('crop') }
    }
    reader.readAsDataURL(file)
  }, [t])

  const startCamera = useCallback(() => { setStep('camera'); void webcam.start() }, [webcam])

  const captureFromCamera = useCallback(() => {
    if (!videoRef.current) return
    const shot = webcam.capture(videoRef.current)
    webcam.stop()
    if (shot) { setRawDataUrl(shot); setStep('crop') }
    else { setStep('source') }
  }, [webcam])

  const doUpload = useCallback(async (croppedDataUrl: string) => {
    setStep('uploading')
    try {
      const blob = dataUrlToBlob(croppedDataUrl)
      const { photoUrl, lastUpdated } = await uploadPatientPhoto(patientId, blob, lastKnownUpdate)
      onUpdated(photoUrl, lastUpdated)
      close()
    } catch (err) {
      setErrorMsg(err instanceof Error && /409/.test(err.message) ? t('conflict') : t('saveFailed'))
      setStep('error')
    }
  }, [patientId, lastKnownUpdate, onUpdated, close, t])

  const doRemove = useCallback(async () => {
    setStep('uploading')
    try {
      const { lastUpdated } = await removePatientPhoto(patientId, lastKnownUpdate)
      onUpdated(null, lastUpdated)
      close()
    } catch (err) {
      setErrorMsg(err instanceof Error && /409/.test(err.message) ? t('conflict') : t('saveFailed'))
      setStep('error')
    }
  }, [patientId, lastKnownUpdate, onUpdated, close, t])

  if (!open) return null
  const actionsDisabled = !online

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md max-h-[90vh] overflow-y-auto gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-1">
          <DialogTitle className="text-lg font-semibold">{t('title')}</DialogTitle>
        </DialogHeader>

        {!online && (
          <div className="px-6 pt-3">
            <Alert variant="warning">{t('offline')}</Alert>
          </div>
        )}

        {/* ── Source: current photo + actions ──────────────────────────── */}
        {step === 'source' && (
          <div className="flex flex-col items-center gap-6 px-6 pb-6 pt-4">
            <div className="h-28 w-28 shrink-0 overflow-hidden rounded-full bg-muted ring-4 ring-primary/15">
              {currentPhotoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentPhotoSrc} alt="" className="h-full w-full object-cover" aria-hidden="true" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <User className="h-11 w-11 text-muted-foreground" aria-hidden="true" />
                </div>
              )}
            </div>

            <div className="flex w-full flex-col gap-2">
              <Button
                variant="primary" fullWidth type="button" className="gap-2"
                disabled={actionsDisabled} onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" aria-hidden="true" /> {t('uploadFile')}
              </Button>
              <Button
                variant="outline" fullWidth type="button" className="gap-2"
                disabled={actionsDisabled} onClick={startCamera}
              >
                <Camera className="h-4 w-4" aria-hidden="true" /> {t('takePhoto')}
              </Button>
              {currentPhotoKey && (
                <Button
                  variant="ghost" fullWidth type="button"
                  className="gap-2 text-destructive hover:bg-destructive/10"
                  disabled={actionsDisabled}
                  onClick={() => (confirmRemove ? void doRemove() : setConfirmRemove(true))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  {confirmRemove ? t('confirmRemove') : t('remove')}
                </Button>
              )}
            </div>

            <p className="text-center text-xs text-muted-foreground">{t('formatsHint')}</p>
          </div>
        )}

        {/* ── Camera: live preview ─────────────────────────────────────── */}
        {step === 'camera' && (
          <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
            <div className="relative mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-xl bg-neutral-900">
              <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
              {webcam.state.status === 'starting' && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                  {t('cameraStarting')}
                </div>
              )}
              {/* Circular framing guide */}
              <div className="pointer-events-none absolute inset-5 rounded-full ring-2 ring-white/70" aria-hidden="true" />
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="outline" type="button" onClick={() => { webcam.stop(); setStep('source') }}>
                {t('back')}
              </Button>
              <Button variant="primary" type="button" className="gap-2" onClick={captureFromCamera}>
                <Camera className="h-4 w-4" aria-hidden="true" /> {t('capture')}
              </Button>
            </div>
          </div>
        )}

        {/* ── Crop: circular guide (matches the avatar) ────────────────── */}
        {step === 'crop' && (
          <div className="flex flex-col px-6 pt-2">
            <p className="pb-3 text-center text-xs text-muted-foreground">{t('cropHint')}</p>
            <div className="flex justify-center">
              <PhotoCropper ref={cropperRef} rawDataUrl={rawDataUrl} onCropped={doUpload} shape="circle" />
            </div>
            <div className="flex justify-between gap-2 pb-6 pt-4">
              <Button variant="outline" type="button" onClick={() => setStep('source')}>{t('back')}</Button>
              <Button variant="primary" type="button" className="gap-2" onClick={() => cropperRef.current?.crop()}>
                <Check className="h-4 w-4" aria-hidden="true" /> {t('usePhoto')}
              </Button>
            </div>
          </div>
        )}

        {/* ── Uploading ────────────────────────────────────────────────── */}
        {step === 'uploading' && (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12">
            <RotateCcw className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t('saving')}</p>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────── */}
        {step === 'error' && (
          <div className="flex flex-col gap-4 px-6 py-6">
            <Alert variant="destructive">{errorMsg}</Alert>
            <div className="flex justify-between gap-2">
              <Button variant="outline" type="button" onClick={close}>{t('cancel')}</Button>
              <Button variant="primary" type="button" onClick={() => setStep('source')}>{t('retry')}</Button>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef} type="file" accept="image/*" className="hidden"
          onChange={onFilePicked} aria-hidden="true" tabIndex={-1}
        />
      </DialogContent>
    </Dialog>
  )
}
