'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

interface PhotoCaptureButtonProps {
  onCapture: (blob: Blob, fileName: string) => void
  onRemove?: () => void
  existingPhoto?: Blob | null
  existingFileName?: string | null
  disabled?: boolean
}

/** Compress an image File/Blob to max 1024×1024 JPEG at 0.7 quality. */
async function compressImage(file: File | Blob, originalName: string): Promise<{ blob: Blob; fileName: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(url)

      const MAX = 1024
      let { width, height } = img

      if (width > MAX || height > MAX) {
        if (width >= height) {
          height = Math.round((height * MAX) / width)
          width = MAX
        } else {
          width = Math.round((width * MAX) / height)
          height = MAX
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas context unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (compressed) => {
          if (!compressed) {
            reject(new Error('canvas.toBlob returned null'))
            return
          }
          const baseName = originalName.replace(/\.[^.]+$/, '')
          resolve({ blob: compressed, fileName: `${baseName}.jpg` })
        },
        'image/jpeg',
        0.7,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image load error'))
    }

    img.src = url
  })
}

export function PhotoCaptureButton({
  onCapture,
  onRemove,
  existingPhoto,
  existingFileName,
  disabled = false,
}: PhotoCaptureButtonProps) {
  const t = useTranslations('safety.audit')
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  // Create / revoke object URL for thumbnail
  useEffect(() => {
    if (!existingPhoto) {
      setThumbnailUrl(null)
      return
    }
    const url = URL.createObjectURL(existingPhoto)
    setThumbnailUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [existingPhoto])

  async function handleFileSelected(file: File) {
    if (!file) return
    setProcessing(true)
    try {
      const { blob, fileName } = await compressImage(file, file.name)
      onCapture(blob, fileName)
    } catch {
      // compression failed — silently discard; do not expose file details in error
    } finally {
      setProcessing(false)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void handleFileSelected(file)
    // reset so the same file can be re-selected
    e.target.value = ''
  }

  if (thumbnailUrl && existingPhoto) {
    return (
      <div className="flex items-center gap-3">
        {/* Thumbnail */}
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-neutral-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnailUrl}
            alt={existingFileName ?? t('photoThumbnailAlt')}
            className="h-full w-full object-cover"
          />
        </div>

        {existingFileName && (
          <span className="max-w-[120px] truncate text-xs text-neutral-500">
            {existingFileName}
          </span>
        )}

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={t('removePhoto')}
            className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100 disabled:opacity-50"
          >
            {t('removePhoto')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {/* Hidden camera input (capture from device camera) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleInputChange}
        disabled={disabled || processing}
      />

      {/* Hidden upload input (file picker) */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleInputChange}
        disabled={disabled || processing}
      />

      <button
        type="button"
        onClick={() => cameraInputRef.current?.click()}
        disabled={disabled || processing}
        aria-label={t('capturePhotoCamera')}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:opacity-50"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        {processing ? t('processing') : t('capturePhotoCamera')}
      </button>

      <button
        type="button"
        onClick={() => uploadInputRef.current?.click()}
        disabled={disabled || processing}
        aria-label={t('uploadPhoto')}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:opacity-50"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        {t('uploadPhoto')}
      </button>
    </div>
  )
}
