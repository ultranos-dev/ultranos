'use client'

import { useState, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { getDb } from '@/lib/db'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import {
  generateAnonymousDisplayName,
  LAB_CATEGORIES,
  MAX_PHOTOS,
} from '@/lib/peer-network-types'
import type { PeerPost, PostPhoto, LabContext } from '@/lib/peer-network-types'
import { processPhoto, isValidPhotoType } from '@/lib/peer-network-photos'

const INPUT_CLASS =
  'w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm ' +
  'focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500'

const TEXTAREA_CLASS =
  'w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm min-h-[120px] resize-y ' +
  'focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500'

interface CreatePostFormProps {
  onPostCreated?: (post: PeerPost) => void
  onCancel?: () => void
}

export function CreatePostForm({ onPostCreated, onCancel }: CreatePostFormProps) {
  const t = useTranslations('peerNetwork')
  const session = useAuthSessionStore((s) => s.session)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [photos, setPhotos] = useState<PostPhoto[]>([])
  const [category, setCategory] = useState('')
  const [testType, setTestType] = useState('')
  const [instrument, setInstrument] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [revealLabName, setRevealLabName] = useState(false)
  const [phiConfirmed, setPhiConfirmed] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [photoProcessing, setPhotoProcessing] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const authorId = session?.practitionerId || session?.userId || 'unknown'
  const anonymousName = generateAnonymousDisplayName(authorId)

  const handlePhotoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const remaining = MAX_PHOTOS - photos.length
    if (remaining <= 0) return

    setPhotoProcessing(true)
    const newPhotos: PostPhoto[] = []
    const photoErrors: string[] = []

    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i]
      if (!isValidPhotoType(file)) {
        photoErrors.push(t('errorInvalidPhotoType'))
        continue
      }
      try {
        const processed = await processPhoto(file)
        newPhotos.push(processed)
      } catch {
        photoErrors.push(t('errorPhotoProcessing'))
      }
    }

    if (photoErrors.length > 0) {
      setErrors(photoErrors)
    }
    if (newPhotos.length > 0) {
      setPhotos((prev) => [...prev, ...newPhotos])
    }
    setPhotoProcessing(false)

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [photos.length, t])

  const removePhoto = useCallback((photoId: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId))
  }, [])

  const validate = useCallback((): string[] => {
    const errs: string[] = []
    if (!title.trim()) errs.push(t('errorTitleRequired'))
    if (!body.trim()) errs.push(t('errorBodyRequired'))
    if (!phiConfirmed) errs.push(t('errorPhiNotConfirmed'))
    return errs
  }, [title, body, phiConfirmed, t])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()

    const validationErrors = validate()
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }

    setErrors([])
    setSubmitting(true)

    try {
      const labContext: LabContext = {}
      if (category) labContext.category = category
      if (testType.trim()) labContext.testType = testType.trim()
      if (instrument.trim()) labContext.instrument = instrument.trim()

      const tags = tagsInput
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)

      const now = new Date().toISOString()
      const post: PeerPost = {
        id: crypto.randomUUID(),
        authorId,
        authorDisplayName: anonymousName,
        labName: revealLabName ? (session?.email?.split('@')[1] || undefined) : undefined,
        title: title.trim(),
        body: body.trim(),
        photos,
        labContext,
        tags,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
        responseCount: 0,
      }

      const db = getDb()
      await db.peer_posts.put(post)

      onPostCreated?.(post)
    } catch {
      setErrors([t('errorUnexpected')])
    } finally {
      setSubmitting(false)
    }
  }, [
    validate, title, body, photos, category, testType, instrument,
    tagsInput, revealLabName, authorId, anonymousName, session, t, onPostCreated,
  ])

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Error banner */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3" role="alert">
          <ul className="list-inside list-disc text-sm text-red-700">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* PHI Warning */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="text-sm font-medium text-amber-800">{t('phiWarningTitle')}</p>
        <p className="mt-1 text-xs text-amber-700">{t('phiWarningBody')}</p>
      </div>

      {/* Title */}
      <div>
        <label htmlFor="post-title" className="mb-1 block text-sm font-medium text-neutral-700">
          {t('title')}
        </label>
        <input
          id="post-title"
          type="text"
          className={INPUT_CLASS}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('titlePlaceholder')}
          maxLength={200}
        />
      </div>

      {/* Body */}
      <div>
        <label htmlFor="post-body" className="mb-1 block text-sm font-medium text-neutral-700">
          {t('body')}
        </label>
        <textarea
          id="post-body"
          className={TEXTAREA_CLASS}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('bodyPlaceholder')}
        />
      </div>

      {/* Photos */}
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          {t('photos')} ({photos.length}/{MAX_PHOTOS})
        </label>
        {photos.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {photos.map((photo) => (
              <div key={photo.id} className="relative">
                <img
                  src={`data:${photo.mimeType};base64,${photo.data}`}
                  alt={photo.alt || t('photoAlt')}
                  className="h-20 w-20 rounded-lg object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  className="absolute -end-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white"
                  aria-label={t('removePhoto')}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
        {photos.length < MAX_PHOTOS && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handlePhotoSelect}
              className="hidden"
              aria-label={t('addPhoto')}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={photoProcessing}
              className="rounded-lg border border-dashed border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:border-primary-500 hover:text-primary-600 disabled:opacity-50"
            >
              {photoProcessing ? t('processingPhoto') : t('addPhoto')}
            </button>
          </>
        )}
      </div>

      {/* Lab Context */}
      <fieldset className="rounded-lg border border-neutral-200 p-3">
        <legend className="px-1 text-sm font-medium text-neutral-700">{t('labContext')}</legend>
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="post-category" className="mb-1 block text-xs text-neutral-600">
              {t('category')}
            </label>
            <select
              id="post-category"
              className={INPUT_CLASS}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">{t('selectCategory')}</option>
              {LAB_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {t(`categories.${cat}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="post-test-type" className="mb-1 block text-xs text-neutral-600">
              {t('testType')}
            </label>
            <input
              id="post-test-type"
              type="text"
              className={INPUT_CLASS}
              value={testType}
              onChange={(e) => setTestType(e.target.value)}
              placeholder={t('testTypePlaceholder')}
            />
          </div>
          <div>
            <label htmlFor="post-instrument" className="mb-1 block text-xs text-neutral-600">
              {t('instrument')}
            </label>
            <input
              id="post-instrument"
              type="text"
              className={INPUT_CLASS}
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
              placeholder={t('instrumentPlaceholder')}
            />
          </div>
        </div>
      </fieldset>

      {/* Tags */}
      <div>
        <label htmlFor="post-tags" className="mb-1 block text-sm font-medium text-neutral-700">
          {t('tags')}
        </label>
        <input
          id="post-tags"
          type="text"
          className={INPUT_CLASS}
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder={t('tagsPlaceholder')}
        />
        <p className="mt-1 text-xs text-neutral-500">{t('tagsHint')}</p>
      </div>

      {/* Anonymization toggle */}
      <div className="rounded-lg border border-neutral-200 p-3">
        <div className="flex items-start gap-3">
          <input
            id="reveal-lab"
            type="checkbox"
            checked={revealLabName}
            onChange={(e) => setRevealLabName(e.target.checked)}
            className="mt-0.5"
          />
          <div>
            <label htmlFor="reveal-lab" className="text-sm font-medium text-neutral-700">
              {t('revealLabName')}
            </label>
            <p className="text-xs text-neutral-500">
              {revealLabName
                ? t('identityRevealed')
                : t('identityAnonymous', { name: anonymousName })}
            </p>
          </div>
        </div>
      </div>

      {/* PHI Confirmation */}
      <div className="flex items-start gap-3">
        <input
          id="phi-confirm"
          type="checkbox"
          checked={phiConfirmed}
          onChange={(e) => setPhiConfirmed(e.target.checked)}
          className="mt-0.5"
        />
        <label htmlFor="phi-confirm" className="text-sm text-neutral-700">
          {t('phiConfirmLabel')}
        </label>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2.5 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            {t('cancel')}
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || !phiConfirmed}
          className="rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {submitting ? t('posting') : t('post')}
        </button>
      </div>
    </form>
  )
}
