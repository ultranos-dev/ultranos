'use client'

/**
 * JournalEntryForm — Story 46.5 Task 4
 *
 * Form for creating a new learning journal entry for a mentorship pairing.
 * Handles photo capture with client-side compression (canvas-based, no external libs),
 * optional case context, and saves to the Dexie `learning_journal` table.
 *
 * RTL-compatible: all spacing uses logical CSS Tailwind utilities.
 * No PHI: journal data is about procedures/skills. caseContext uses LOINC codes only.
 */

import { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { getDb } from '@/lib/db'
import { hlc, serializeHlc } from '@/lib/hlc'
import type { MentorshipPairing, LearningJournalEntry } from '@/lib/mentorship-types'
import { Button } from '@/components/ui/Button'

const MAX_PHOTOS = 3

// ---------------------------------------------------------------------------
// Photo compression — canvas-based, strips EXIF, max 800px wide, JPEG 0.8 quality
// ---------------------------------------------------------------------------

async function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 800 / Math.max(img.width, img.height))
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.src = url
  })
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AttachedPhoto {
  id: string
  data: string      // base64 data URI
  mimeType: string
  alt: string
}

export interface JournalEntryFormProps {
  pairing: MentorshipPairing
  currentUserId: string
  authorRole: 'mentor' | 'mentee'
  onComplete: (entry: LearningJournalEntry) => void
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function JournalEntryForm({
  pairing,
  currentUserId,
  authorRole,
  onComplete,
  onCancel,
}: JournalEntryFormProps) {
  const t = useTranslations('mentorship')

  // Form fields
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [photos, setPhotos] = useState<AttachedPhoto[]>([])
  const [showCaseContext, setShowCaseContext] = useState(false)
  const [procedureRef, setProcedureRef] = useState('')
  const [procedureName, setProcedureName] = useState('')
  const [learningOutcome, setLearningOutcome] = useState('')

  // UI state
  const [titleError, setTitleError] = useState<string | null>(null)
  const [bodyError, setBodyError] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [processingPhoto, setProcessingPhoto] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ---------------------------------------------------------------------------
  // Photo handling
  // ---------------------------------------------------------------------------

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    const remaining = MAX_PHOTOS - photos.length
    const toProcess = files.slice(0, remaining)

    setPhotoError(null)
    setProcessingPhoto(true)

    try {
      const newPhotos: AttachedPhoto[] = []
      for (const file of toProcess) {
        const data = await compressPhoto(file)
        newPhotos.push({
          id: crypto.randomUUID(),
          data,
          mimeType: 'image/jpeg',
          alt: '',
        })
      }
      setPhotos((prev) => [...prev, ...newPhotos])
    } catch {
      setPhotoError(t('journalPhotoProcessingError'))
    } finally {
      setProcessingPhoto(false)
      // Reset input so the same file can be selected again if needed
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleRemovePhoto(photoId: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId))
    setPhotoError(null)
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    let valid = true
    if (!title.trim()) {
      setTitleError(t('journalTitleRequired'))
      valid = false
    } else {
      setTitleError(null)
    }
    if (!body.trim()) {
      setBodyError(t('journalBodyRequired'))
      valid = false
    } else {
      setBodyError(null)
    }
    if (!valid) return

    setSaving(true)
    try {
      const entry: LearningJournalEntry = {
        id: crypto.randomUUID(),
        pairingId: pairing.id,
        authorId: currentUserId,
        authorRole,
        title: title.trim(),
        body: body.trim(),
        photos: photos.map(({ id, data, mimeType, alt }) => ({ id, data, mimeType, alt })),
        caseContext: showCaseContext
          ? {
              procedureRef: procedureRef.trim() || undefined,
              procedureName: procedureName.trim() || undefined,
              learningOutcome: learningOutcome.trim() || undefined,
            }
          : undefined,
        createdAt: serializeHlc(hlc.now()),
        syncStatus: 'pending',
      }

      const db = getDb()
      await db.learning_journal.add(entry)

      onComplete(entry)
    } catch {
      // Surface a generic save error — no PHI in message
      setBodyError(t('journalSaveError'))
    } finally {
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>

      {/* Title */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="journal-title"
          className="text-sm font-medium text-neutral-700"
        >
          {t('journalTitleLabel')}
          <span className="ms-1 text-red-600" aria-hidden="true">*</span>
        </label>
        <input
          id="journal-title"
          type="text"
          dir="auto"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            if (titleError) setTitleError(null)
          }}
          disabled={saving}
          required
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-start
            focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500
            disabled:opacity-50"
          aria-describedby={titleError ? 'journal-title-error' : undefined}
        />
        {titleError && (
          <p id="journal-title-error" role="alert" className="text-xs text-red-600">
            {titleError}
          </p>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="journal-body"
          className="text-sm font-medium text-neutral-700"
        >
          {t('journalBodyLabel')}
          <span className="ms-1 text-red-600" aria-hidden="true">*</span>
        </label>
        <textarea
          id="journal-body"
          dir="auto"
          rows={5}
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            if (bodyError) setBodyError(null)
          }}
          disabled={saving}
          required
          className="rounded-lg border border-neutral-300 px-4 py-3 text-sm text-start
            focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500
            disabled:opacity-50"
          aria-describedby={bodyError ? 'journal-body-error' : undefined}
        />
        {bodyError && (
          <p id="journal-body-error" role="alert" className="text-xs text-red-600">
            {bodyError}
          </p>
        )}
      </div>

      {/* Photos */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-neutral-700">
          {t('journalPhotosLabel')}
          <span className="ms-1 text-xs font-normal text-neutral-500">
            {t('journalPhotosHint', { max: MAX_PHOTOS })}
          </span>
        </p>

        {/* Photo previews */}
        {photos.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {photos.map((photo) => (
              <div key={photo.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.data}
                  alt={photo.alt || t('journalPhotoPreviewAlt')}
                  className="h-20 w-20 rounded-md object-cover ring-1 ring-neutral-200"
                />
                <button
                  type="button"
                  onClick={() => handleRemovePhoto(photo.id)}
                  disabled={saving}
                  className="absolute -end-2 -top-2 flex h-5 w-5 items-center justify-center
                    rounded-full bg-red-500 text-white shadow
                    focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-50"
                  aria-label={t('journalRemovePhotoAriaLabel')}
                >
                  <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* File input — hidden, triggered by button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          className="sr-only"
          aria-hidden="true"
          onChange={handlePhotoChange}
          disabled={saving || processingPhoto || photos.length >= MAX_PHOTOS}
          tabIndex={-1}
        />

        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={saving || processingPhoto}
            className="self-start rounded-lg border border-dashed border-neutral-300 px-4 py-2
              text-sm text-neutral-600 hover:border-primary-400 hover:text-primary-600
              focus:outline-none focus:ring-2 focus:ring-primary-300 disabled:opacity-50"
          >
            {processingPhoto ? t('journalPhotoProcessing') : t('journalAddPhoto')}
          </button>
        )}

        {photoError && (
          <p role="alert" className="text-xs text-red-600">{photoError}</p>
        )}
      </div>

      {/* Case context toggle */}
      <div className="flex flex-col gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={showCaseContext}
            onChange={(e) => setShowCaseContext(e.target.checked)}
            disabled={saving}
            className="h-4 w-4 rounded border-neutral-300 accent-primary-500 disabled:opacity-50"
          />
          {t('journalAddCaseContext')}
        </label>

        {showCaseContext && (
          <div className="flex flex-col gap-3 rounded-lg bg-neutral-50 p-4">
            {/* Procedure ref (LOINC code) */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="journal-procedure-ref"
                className="text-xs font-medium text-neutral-600"
              >
                {t('journalProcedureRefLabel')}
              </label>
              <input
                id="journal-procedure-ref"
                type="text"
                dir="auto"
                value={procedureRef}
                onChange={(e) => setProcedureRef(e.target.value)}
                disabled={saving}
                placeholder={t('journalProcedureRefPlaceholder')}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-start
                  focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500
                  disabled:opacity-50"
              />
            </div>

            {/* Procedure name */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="journal-procedure-name"
                className="text-xs font-medium text-neutral-600"
              >
                {t('journalProcedureNameLabel')}
              </label>
              <input
                id="journal-procedure-name"
                type="text"
                dir="auto"
                value={procedureName}
                onChange={(e) => setProcedureName(e.target.value)}
                disabled={saving}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-start
                  focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500
                  disabled:opacity-50"
              />
            </div>

            {/* Learning outcome */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="journal-learning-outcome"
                className="text-xs font-medium text-neutral-600"
              >
                {t('journalLearningOutcomeFormLabel')}
              </label>
              <textarea
                id="journal-learning-outcome"
                dir="auto"
                rows={3}
                value={learningOutcome}
                onChange={(e) => setLearningOutcome(e.target.value)}
                disabled={saving}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-start
                  focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500
                  disabled:opacity-50"
              />
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-neutral-200 pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={saving}
        >
          {t('journalCancel')}
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={saving || processingPhoto}
        >
          {saving ? t('journalSaving') : t('journalSubmit')}
        </Button>
      </div>
    </form>
  )
}
