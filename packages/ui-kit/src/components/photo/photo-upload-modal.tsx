'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Upload, Trash2, User, Check, RotateCcw } from '../../icons.js'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog.js'
import { Alert } from '../ui/alert.js'
import { Button } from '../ui/button.js'
import { PhotoCropper, type PhotoCropperHandle } from './photo-cropper.js'
import { useWebcamCapture } from './use-webcam-capture.js'

const RAW_SIZE_LIMIT = 20 * 1024 * 1024

type Step = 'source' | 'camera' | 'crop' | 'uploading' | 'error'

export interface PhotoUploadLabels {
  title: string; uploadFile: string; takePhoto: string; remove: string; confirmRemove: string
  formatsHint: string; cameraStarting: string; back: string; capture: string; cropHint: string
  usePhoto: string; saving: string; cancel: string; retry: string; offline: string
  tooLarge: string; conflict: string; saveFailed: string; zoom: string; sizeError: string
}

const DEFAULT_LABELS: PhotoUploadLabels = {
  title: 'Photo', uploadFile: 'Upload File', takePhoto: 'Take Photo', remove: 'Remove Photo',
  confirmRemove: 'Tap again to confirm', formatsHint: 'JPG, PNG or WebP. Square works best.',
  cameraStarting: 'Starting camera…', back: 'Back', capture: 'Capture', cropHint: 'Drag to reposition, pinch or scroll to zoom.',
  usePhoto: 'Use Photo', saving: 'Saving…', cancel: 'Cancel', retry: 'Retry', offline: 'You are offline. Photo changes need a connection.',
  tooLarge: 'That file is too large (max 20 MB).', conflict: 'This record changed elsewhere. Reopen and try again.',
  saveFailed: 'Could not save the photo. Please try again.', zoom: 'Zoom', sizeError: 'Image is too large after cropping. Try a smaller area.',
}

export interface PhotoUploadModalProps {
  open: boolean
  /** Storage key of the current photo, or null. Drives the Remove affordance. */
  currentPhotoKey: string | null
  /** Signed URL for the current photo, shown in the preview. */
  currentPhotoSrc?: string | null
  lastKnownUpdate: string
  onClose: () => void
  onUpdated: (photoKey: string | null, lastUpdated: string) => void
  /** Uploads the cropped blob; returns the new storage key + updated timestamp. */
  uploadFn: (blob: Blob, lastKnownUpdate: string) => Promise<{ photoKey: string; lastUpdated: string }>
  /** Removes the photo; returns the updated timestamp. Omit to hide the Remove action. */
  removeFn?: (lastKnownUpdate: string) => Promise<{ lastUpdated: string }>
  /** Crop guide shape (default circle, for avatars). */
  cropShape?: 'circle' | 'square'
  /** Localized labels — pass your app's translations; falls back to English. */
  labels?: Partial<PhotoUploadLabels>
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

/**
 * App-agnostic photo upload modal: file pick + webcam capture + interactive crop.
 * Uploads happen through the injected `uploadFn`/`removeFn`, so any app (patient,
 * staff, …) reuses the same UX. The server is expected to re-encode to WebP.
 */
export function PhotoUploadModal({
  open, currentPhotoKey, currentPhotoSrc, lastKnownUpdate, onClose, onUpdated,
  uploadFn, removeFn, cropShape = 'circle', labels,
}: PhotoUploadModalProps) {
  const L = { ...DEFAULT_LABELS, ...labels }
  const [step, setStep] = useState<Step>('source')
  const [rawDataUrl, setRawDataUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [online, setOnline] = useState(true)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cropperRef = useRef<PhotoCropperHandle>(null)
  const webcam = useWebcamCapture()

  useEffect(() => {
    if (open) {
      setStep('source'); setRawDataUrl(null); setErrorMsg(''); setConfirmRemove(false)
      setOnline(navigator.onLine)
    }
  }, [open])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])

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
    if (file.size > RAW_SIZE_LIMIT) { setErrorMsg(L.tooLarge); setStep('error'); return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result
      if (typeof result === 'string') { setRawDataUrl(result); setStep('crop') }
    }
    reader.readAsDataURL(file)
  }, [L.tooLarge])

  const startCamera = useCallback(() => { setStep('camera'); void webcam.start() }, [webcam])

  const captureFromCamera = useCallback(() => {
    if (!videoRef.current) return
    const shot = webcam.capture(videoRef.current)
    webcam.stop()
    if (shot) { setRawDataUrl(shot); setStep('crop') } else { setStep('source') }
  }, [webcam])

  const doUpload = useCallback(async (croppedDataUrl: string) => {
    setStep('uploading')
    try {
      const blob = dataUrlToBlob(croppedDataUrl)
      const { photoKey, lastUpdated } = await uploadFn(blob, lastKnownUpdate)
      onUpdated(photoKey, lastUpdated)
      close()
    } catch (err) {
      setErrorMsg(err instanceof Error && /409/.test(err.message) ? L.conflict : L.saveFailed)
      setStep('error')
    }
  }, [uploadFn, lastKnownUpdate, onUpdated, close, L.conflict, L.saveFailed])

  const doRemove = useCallback(async () => {
    if (!removeFn) return
    setStep('uploading')
    try {
      const { lastUpdated } = await removeFn(lastKnownUpdate)
      onUpdated(null, lastUpdated)
      close()
    } catch (err) {
      setErrorMsg(err instanceof Error && /409/.test(err.message) ? L.conflict : L.saveFailed)
      setStep('error')
    }
  }, [removeFn, lastKnownUpdate, onUpdated, close, L.conflict, L.saveFailed])

  if (!open) return null
  const actionsDisabled = !online

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md max-h-[90vh] overflow-y-auto gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-1">
          <DialogTitle className="text-lg font-semibold">{L.title}</DialogTitle>
        </DialogHeader>

        {!online && <div className="px-6 pt-3"><Alert variant="warning">{L.offline}</Alert></div>}

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
              <Button variant="default" type="button" className="w-full gap-2" disabled={actionsDisabled} onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" aria-hidden="true" /> {L.uploadFile}
              </Button>
              <Button variant="outline" type="button" className="w-full gap-2" disabled={actionsDisabled} onClick={startCamera}>
                <Camera className="h-4 w-4" aria-hidden="true" /> {L.takePhoto}
              </Button>
              {currentPhotoKey && removeFn && (
                <Button variant="ghost" type="button" className="w-full gap-2 text-destructive hover:bg-destructive/10" disabled={actionsDisabled}
                  onClick={() => (confirmRemove ? void doRemove() : setConfirmRemove(true))}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> {confirmRemove ? L.confirmRemove : L.remove}
                </Button>
              )}
            </div>

            <p className="text-center text-xs text-muted-foreground">{L.formatsHint}</p>
          </div>
        )}

        {step === 'camera' && (
          <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
            <div className="relative mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-xl bg-neutral-900">
              <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
              {webcam.state.status === 'starting' && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">{L.cameraStarting}</div>
              )}
              <div className="pointer-events-none absolute inset-5 rounded-full ring-2 ring-white/70" aria-hidden="true" />
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="outline" type="button" onClick={() => { webcam.stop(); setStep('source') }}>{L.back}</Button>
              <Button variant="default" type="button" className="gap-2" onClick={captureFromCamera}>
                <Camera className="h-4 w-4" aria-hidden="true" /> {L.capture}
              </Button>
            </div>
          </div>
        )}

        {step === 'crop' && (
          <div className="flex flex-col px-6 pt-2">
            <p className="pb-3 text-center text-xs text-muted-foreground">{L.cropHint}</p>
            <div className="flex justify-center">
              <PhotoCropper ref={cropperRef} rawDataUrl={rawDataUrl} onCropped={doUpload} shape={cropShape} zoomLabel={L.zoom} sizeErrorLabel={L.sizeError} />
            </div>
            <div className="flex justify-between gap-2 pb-6 pt-4">
              <Button variant="outline" type="button" onClick={() => setStep('source')}>{L.back}</Button>
              <Button variant="default" type="button" className="gap-2" onClick={() => cropperRef.current?.crop()}>
                <Check className="h-4 w-4" aria-hidden="true" /> {L.usePhoto}
              </Button>
            </div>
          </div>
        )}

        {step === 'uploading' && (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12">
            <RotateCcw className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{L.saving}</p>
          </div>
        )}

        {step === 'error' && (
          <div className="flex flex-col gap-4 px-6 py-6">
            <Alert variant="destructive">{errorMsg}</Alert>
            <div className="flex justify-between gap-2">
              <Button variant="outline" type="button" onClick={close}>{L.cancel}</Button>
              <Button variant="default" type="button" onClick={() => setStep('source')}>{L.retry}</Button>
            </div>
          </div>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFilePicked} aria-hidden="true" tabIndex={-1} />
      </DialogContent>
    </Dialog>
  )
}
