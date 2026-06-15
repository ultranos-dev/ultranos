'use client'

import { useRef, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Camera, Upload, X, User, AlertCircle } from '@ultranos/ui-kit/icons'
import { Card } from '@/components/Card'
import { PhotoCropModal } from './PhotoCropModal'

const RAW_SIZE_LIMIT = 20 * 1024 * 1024 // 20 MB sanity cap before crop

interface PatientPhotoSectionProps {
  photoDataUrl: string | null
  onPhotoChange: (dataUrl: string | null) => void
}

export function PatientPhotoSection({ photoDataUrl, onPhotoChange }: PatientPhotoSectionProps) {
  const t = useTranslations('registration')
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [rawDataUrl, setRawDataUrl] = useState<string | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const [fileError, setFileError] = useState('')

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // reset so same file can be re-selected
    if (!file) return

    setFileError('')

    if (file.size > RAW_SIZE_LIMIT) {
      setFileError(t('patientPhotoRawTooBig'))
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result
      if (typeof result === 'string') {
        setRawDataUrl(result)
        setCropOpen(true)
      }
    }
    reader.readAsDataURL(file)
  }, [t])

  const handleCropConfirm = useCallback((croppedDataUrl: string) => {
    onPhotoChange(croppedDataUrl)
    setCropOpen(false)
    setRawDataUrl(null)
  }, [onPhotoChange])

  const handleCropCancel = useCallback(() => {
    setCropOpen(false)
    setRawDataUrl(null)
  }, [])

  return (
    <>
      <PhotoCropModal
        open={cropOpen}
        rawDataUrl={rawDataUrl}
        onConfirm={handleCropConfirm}
        onCancel={handleCropCancel}
      />

      <Card>
        <p className="text-base font-bold text-foreground mb-4">{t('patientPhotoSection')}</p>

        <div className="flex items-start gap-5">
          {/* Photo preview */}
          <div className="shrink-0">
            <div className="h-24 w-24 rounded-full overflow-hidden border-2 border-border bg-muted flex items-center justify-center">
              {photoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoDataUrl} alt="Patient photo" className="h-full w-full object-cover" />
              ) : (
                <User className="h-10 w-10 text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 flex-1 pt-1">
            <p className="text-sm text-muted-foreground">{t('patientPhotoOptional')}</p>

            <div className="flex flex-wrap gap-2 mt-1">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center gap-1.5 min-h-[44px] rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <Camera className="h-4 w-4" />
                {t('patientPhotoCapture')}
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 min-h-[44px] rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <Upload className="h-4 w-4" />
                {t('patientPhotoUpload')}
              </button>

              {photoDataUrl && (
                <button
                  type="button"
                  onClick={() => { onPhotoChange(null); setFileError('') }}
                  className="flex items-center gap-1.5 min-h-[44px] rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors"
                >
                  <X className="h-4 w-4" />
                  {t('patientPhotoRemove')}
                </button>
              )}
            </div>

            {fileError && (
              <div className="flex items-center gap-1.5 text-sm text-destructive mt-1">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {fileError}
              </div>
            )}
          </div>
        </div>

        {/* Hidden inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={handleFileChange}
          aria-hidden="true"
          tabIndex={-1}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          aria-hidden="true"
          tabIndex={-1}
        />
      </Card>
    </>
  )
}
