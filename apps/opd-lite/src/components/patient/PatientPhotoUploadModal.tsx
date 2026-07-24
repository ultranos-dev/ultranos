'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Camera, Upload, Trash2, RotateCcw } from '@ultranos/ui-kit/icons'
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
  currentPhotoKey: string | null
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
  open, patientId, currentPhotoKey, lastKnownUpdate, onClose, onUpdated,
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
      <DialogContent className="max-w-sm w-full gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        {!online && <div className="px-5 pb-3"><Alert variant="warning">{t('offline')}</Alert></div>}

        {step === 'source' && (
          <div className="flex flex-col gap-4 px-5 pb-5">
            <div className="mx-auto h-24 w-24 overflow-hidden rounded-full bg-muted flex items-center justify-center">
              {/* Current photo preview is rendered by PatientAvatar upstream; here show a neutral placeholder. */}
              <Camera className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" type="button" disabled={actionsDisabled}
                onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" /> {t('uploadFile')}
              </Button>
              <Button variant="outline" type="button" disabled={actionsDisabled} onClick={startCamera}>
                <Camera className="h-4 w-4" /> {t('takePhoto')}
              </Button>
              {currentPhotoKey && (
                <Button variant="danger" type="button" disabled={actionsDisabled}
                  onClick={() => (confirmRemove ? void doRemove() : setConfirmRemove(true))}>
                  <Trash2 className="h-4 w-4" /> {confirmRemove ? t('confirmRemove') : t('remove')}
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 'camera' && (
          <div className="flex flex-col items-center gap-3 px-5 pb-5">
            {webcam.state.status === 'starting' && <p className="text-sm text-muted-foreground">{t('cameraStarting')}</p>}
            <video ref={videoRef} className="w-full rounded-xl bg-neutral-900" playsInline muted />
            <div className="flex justify-end gap-2 self-stretch">
              <Button variant="outline" type="button" onClick={() => { webcam.stop(); setStep('source') }}>{t('back')}</Button>
              <Button variant="primary" type="button" onClick={captureFromCamera}>{t('capture')}</Button>
            </div>
          </div>
        )}

        {step === 'crop' && (
          <>
            <div className="flex justify-center px-5">
              <PhotoCropper ref={cropperRef} rawDataUrl={rawDataUrl} onCropped={doUpload} />
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <Button variant="outline" type="button" onClick={() => setStep('source')}>{t('back')}</Button>
              <Button variant="primary" type="button" onClick={() => cropperRef.current?.crop()}>{t('usePhoto')}</Button>
            </div>
          </>
        )}

        {step === 'uploading' && (
          <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
            <RotateCcw className="h-4 w-4 animate-spin" aria-hidden="true" /> {t('saving')}
          </div>
        )}

        {step === 'error' && (
          <div className="flex flex-col gap-4 px-5 py-5">
            <Alert variant="destructive">{errorMsg}</Alert>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={close}>{t('cancel')}</Button>
              <Button variant="primary" type="button" onClick={() => setStep('source')}>{t('retry')}</Button>
            </div>
          </div>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
          onChange={onFilePicked} aria-hidden="true" tabIndex={-1} />
      </DialogContent>
    </Dialog>
  )
}
