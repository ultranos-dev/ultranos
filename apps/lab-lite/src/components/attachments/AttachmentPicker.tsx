'use client'

import React, { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Upload, X, FileText, Image } from '@ultranos/ui-kit/icons'
import {
  transcodeToWebp,
  TranscodeTooLargeError,
  TranscodeUnsupportedError,
} from '@/lib/image-transcode'

// ─── Public constants ────────────────────────────────────────────────────────

export const MAX_PDF_BYTES = 10_485_760 // 10 MiB
export const MAX_ATTACHMENTS_PER_PARENT = 10

// ─── Public types ────────────────────────────────────────────────────────────

export interface PreparedAttachment {
  blob: Blob
  fileName: string
  fileType: 'image/webp' | 'application/pdf'
  kind: 'image' | 'pdf'
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface AttachmentPickerProps {
  value: PreparedAttachment[]
  onChange: (next: PreparedAttachment[]) => void
  /** Default: MAX_ATTACHMENTS_PER_PARENT (10) */
  max?: number
}

export function AttachmentPicker({
  value,
  onChange,
  max = MAX_ATTACHMENTS_PER_PARENT,
}: AttachmentPickerProps): React.JSX.Element {
  const t = useTranslations('attachments')
  const inputRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const canAdd = value.length < max

  async function handleFiles(
    files: FileList | null,
    currentValue: PreparedAttachment[],
    currentMax: number,
  ) {
    if (!files || files.length === 0) return

    const fileArray = Array.from(files)
    let accumulated = [...currentValue]

    for (const file of fileArray) {
      // Check cap before each file
      if (accumulated.length >= currentMax) {
        setError(t('maxReached', { max: currentMax }))
        break
      }

      const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      const isPdf = file.type === 'application/pdf'

      if (!isImage && !isPdf) {
        setError(t('errorUnsupported'))
        // Continue processing remaining files — one bad file does not abort the rest
        continue
      }

      if (isPdf) {
        if (file.size > MAX_PDF_BYTES) {
          setError(t('errorPdfSize'))
          continue
        }
        const prepared: PreparedAttachment = {
          blob: file,
          fileName: file.name,
          fileType: 'application/pdf',
          kind: 'pdf',
        }
        accumulated = [...accumulated, prepared]
        continue
      }

      // Image path — transcode to WebP
      setProcessing(true)
      try {
        const result = await transcodeToWebp(file)
        const prepared: PreparedAttachment = {
          blob: result.blob,
          fileName: file.name.replace(/\.[^.]+$/, '.webp'),
          fileType: 'image/webp',
          kind: 'image',
        }
        accumulated = [...accumulated, prepared]
      } catch (err) {
        if (err instanceof TranscodeUnsupportedError) {
          setError(t('errorUnsupported'))
        } else if (err instanceof TranscodeTooLargeError) {
          setError(t('errorTooLarge'))
        } else {
          setError(t('errorGeneric'))
        }
        // Continue processing remaining files
      } finally {
        setProcessing(false)
      }
    }

    // Only call onChange once after processing all files, if anything was added
    if (accumulated.length !== currentValue.length) {
      onChange(accumulated)
    }

    // Reset input so the same file can be re-added if removed
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    void handleFiles(e.target.files, value, max)
  }

  function handleRemove(index: number) {
    const next = value.filter((_, i) => i !== index)
    onChange(next)
    setError(null)
  }

  // Drag-and-drop handlers
  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(true)
  }

  function handleDragLeave() {
    setDragging(false)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    void handleFiles(e.dataTransfer.files, value, max)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        multiple
        data-testid="attachment-input"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="sr-only"
        aria-label={t('dropZoneLabel')}
        onChange={handleInputChange}
        disabled={processing || !canAdd}
      />

      {/* Drop zone — only show when more can be added */}
      {canAdd && (
        <div
          role="button"
          tabIndex={0}
          aria-label={t('dropZoneLabel')}
          aria-disabled={processing}
          className={[
            'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors',
            dragging
              ? 'border-primary bg-primary/5'
              : 'border-border bg-card hover:border-primary/60 hover:bg-muted/40',
            processing ? 'cursor-wait opacity-60' : 'cursor-pointer',
          ].join(' ')}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !processing && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !processing) {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
        >
          {processing ? (
            <>
              <svg
                className="animate-spin size-6 text-primary"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <span className="text-sm text-muted-foreground">{t('processing')}</span>
            </>
          ) : (
            <>
              <Upload size={24} className="text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium text-foreground">{t('browseButton')}</span>
              <span className="text-xs text-muted-foreground">{t('dropZoneHint')}</span>
            </>
          )}
        </div>
      )}

      {/* Error alert */}
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Attachment chip list */}
      {value.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={t('attachedFilesLabel')}>
          {value.map((att, index) => (
            <li
              key={`${att.fileName}-${index}`}
              className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2"
            >
              {att.kind === 'pdf' ? (
                <FileText size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              ) : (
                <Image size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{att.fileName}</span>
              <button
                type="button"
                aria-label={t('removeAriaLabel', { name: att.fileName })}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => handleRemove(index)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
