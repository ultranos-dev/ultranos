'use client'

import { useState, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { getDb } from '@/lib/db'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { generateAnonymousDisplayName, MAX_PHOTOS } from '@/lib/peer-network-types'
import type { PeerResponse, PostPhoto } from '@/lib/peer-network-types'
import { processPhoto, isValidPhotoType } from '@/lib/peer-network-photos'

const TEXTAREA_CLASS =
  'w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm min-h-[80px] resize-y ' +
  'focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500'

interface ResponseFormProps {
  postId: string
  onResponseCreated: () => void
  onCancel: () => void
}

export function ResponseForm({ postId, onResponseCreated, onCancel }: ResponseFormProps) {
  const t = useTranslations('peerNetwork')
  const session = useAuthSessionStore((s) => s.session)

  const [body, setBody] = useState('')
  const [photos, setPhotos] = useState<PostPhoto[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [photoProcessing, setPhotoProcessing] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const authorId = session?.practitionerId || session?.userId || 'unknown'
  const isMentor = session?.labRole === 'supervisor' || session?.labRole === 'lab_manager'

  const handlePhotoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const remaining = MAX_PHOTOS - photos.length
    if (remaining <= 0) return

    setPhotoProcessing(true)
    const newPhotos: PostPhoto[] = []

    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i]
      if (!isValidPhotoType(file)) continue
      try {
        const processed = await processPhoto(file)
        newPhotos.push(processed)
      } catch {
        // Skip failed photos
      }
    }

    if (newPhotos.length > 0) {
      setPhotos((prev) => [...prev, ...newPhotos])
    }
    setPhotoProcessing(false)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [photos.length])

  const removePhoto = useCallback((photoId: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId))
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()

    if (!body.trim()) {
      setErrors([t('errorBodyRequired')])
      return
    }

    setErrors([])
    setSubmitting(true)

    try {
      const response: PeerResponse = {
        id: crypto.randomUUID(),
        postId,
        authorId,
        authorDisplayName: generateAnonymousDisplayName(authorId),
        body: body.trim(),
        photos,
        isFromMentor: isMentor,
        createdAt: new Date().toISOString(),
        syncStatus: 'pending',
      }

      const db = getDb()
      await db.peer_responses.put(response)

      onResponseCreated()
    } catch {
      setErrors([t('errorUnexpected')])
    } finally {
      setSubmitting(false)
    }
  }, [body, photos, postId, authorId, isMentor, t, onResponseCreated])

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-neutral-200 p-3">
      {errors.length > 0 && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2" role="alert">
          <ul className="list-inside list-disc text-sm text-red-700">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <textarea
        className={TEXTAREA_CLASS}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('responseBodyPlaceholder')}
      />

      {/* Photos */}
      {photos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="relative">
              <img
                src={`data:${photo.mimeType};base64,${photo.data}`}
                alt={t('photoAlt')}
                className="h-16 w-16 rounded-lg object-cover"
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

      <div className="mt-2 flex items-center justify-between">
        {photos.length < MAX_PHOTOS && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handlePhotoSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={photoProcessing}
              className="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50"
            >
              {photoProcessing ? t('processingPhoto') : t('attachPhoto')}
            </button>
          </>
        )}
        <div className="ms-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {submitting ? t('responding') : t('respond')}
          </button>
        </div>
      </div>
    </form>
  )
}
