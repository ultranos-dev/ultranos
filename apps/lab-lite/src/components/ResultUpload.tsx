'use client'

import { useState, useRef, useCallback } from 'react'
import { formatFileSize } from '@/lib/format'
import { X, Upload } from '@ultranos/ui-kit/icons'

const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
])

const ACCEPTED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png'
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

interface ResultUploadProps {
  onFileSelected: (file: File) => void
  uploading?: boolean
  progress?: number
  disabled?: boolean
}

/**
 * Drag-and-drop file upload zone with file picker fallback.
 * Client-side validation: file type (PDF, JPEG, PNG) and size (20 MB max).
 *
 * Story 12.3 — AC 1, 2, 3
 */
export function ResultUpload({ onFileSelected, uploading, progress, disabled }: ResultUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateAndSelect = useCallback(
    (file: File) => {
      setError(null)

      if (!ACCEPTED_TYPES.has(file.type)) {
        setError('Only PDF, JPEG, and PNG files are accepted.')
        return
      }

      if (file.size > MAX_FILE_SIZE) {
        setError(`File exceeds the 20 MB size limit (${formatFileSize(file.size)}).`)
        return
      }

      setSelectedFile(file)
      onFileSelected(file)
    },
    [onFileSelected],
  )

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) validateAndSelect(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) validateAndSelect(file)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  function handleRemove() {
    setSelectedFile(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  // Upload progress state
  if (uploading) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 p-6">
        <p className="text-sm font-medium text-primary-700">Uploading...</p>
        <div
          role="progressbar"
          aria-valuenow={progress ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 w-full overflow-hidden rounded-full bg-primary-100"
        >
          <div
            className="h-full rounded-full bg-primary-600 transition-[width] duration-300 ease-out"
            style={{ width: `${progress ?? 0}%` }}
          />
        </div>
        <span className="text-xs text-primary-600">{progress ?? 0}%</span>
      </div>
    )
  }

  // File selected — show file info
  if (selectedFile) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
          <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
        </div>
        <button
          type="button"
          onClick={handleRemove}
          aria-label="Remove file"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
        >
          <X size={20} />
        </button>
      </div>
    )
  }

  // Drop zone — default state
  return (
    <div className="flex flex-col gap-2">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragOver
            ? 'border-primary-500 bg-primary-50'
            : 'border-border bg-muted/30 hover:border-primary-400'
        } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload lab result file"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
      >
        <Upload size={32} className="text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Drag and drop your lab result file here, or{' '}
          <span className="font-semibold text-primary-600">browse files</span>
        </p>
        <p className="text-xs text-muted-foreground">PDF, JPEG, or PNG (max 20 MB)</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileChange}
          disabled={disabled}
          className="hidden"
        />
      </div>
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
