'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Camera, User } from '@ultranos/ui-kit/icons'
import { AVATAR_RING } from '@ultranos/ui-kit/components/ui/avatar'
import { PhotoUploadModal } from '@ultranos/ui-kit/components/photo/photo-upload-modal'
import { Card } from '../ui/card.js'
import type { PatientPhotoApi } from '../../types.js'

interface PatientPhotoSectionProps {
  /** Local captured data URL (create/deferred mode). */
  photoDataUrl: string | null
  onPhotoChange: (dataUrl: string | null) => void
  /**
   * Edit mode: when a patientId is given the photo uploads IMMEDIATELY to that
   * patient (the patient exists), the current photo is loaded from the Hub, and
   * `photoDataUrl` is unused. Absent → create/deferred mode (upload happens at
   * registration submit).
   */
  patientId?: string
  lastKnownUpdate?: string
  /** Injected photo transport (opaque-key upload/fetch/remove lives in the host app). */
  photoApi: PatientPhotoApi
}

/** Cropped Blob → data URL (deferred local capture). */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/**
 * Patient photo capture — same UX as the patient-profile "Update patient photo"
 * flow: a clickable avatar (camera hover overlay) opens the shared ui-kit
 * PhotoUploadModal (file pick + webcam + circle crop + remove).
 *
 * Two modes:
 * - Create (no patientId): the patient doesn't exist yet, so the cropped image is
 *   captured into local form state (photoDataUrl); the actual upload is deferred to
 *   registration submit (online post-create upload / encrypted offline stash).
 * - Edit (patientId given): the patient exists, so the crop uploads IMMEDIATELY to
 *   the Hub (opaque-key storage, Rule #7) and the current photo is shown.
 */
export function PatientPhotoSection({
  photoDataUrl,
  onPhotoChange,
  patientId,
  lastKnownUpdate,
  photoApi,
}: PatientPhotoSectionProps) {
  const t = useTranslations('patientPhoto')
  const [modalOpen, setModalOpen] = useState(false)
  const [serverPhotoSrc, setServerPhotoSrc] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  const immediate = !!patientId

  // Edit mode: load (and refresh after upload/remove) the current signed photo URL.
  useEffect(() => {
    if (!patientId) return
    let cancelled = false
    const controller = new AbortController()
    ;(async () => {
      const url = await photoApi.getPatientPhotoUrl(patientId, controller.signal)
      if (!cancelled) setServerPhotoSrc(url)
    })()
    return () => { cancelled = true; controller.abort() }
  }, [patientId, refresh])

  const previewSrc = immediate ? serverPhotoSrc : photoDataUrl

  return (
    <Card>
      <div className="flex flex-col items-center gap-4">
        {/* Clickable avatar — opens the shared photo modal (same as patient profile) */}
        <div
          className={`group relative h-24 w-24 cursor-pointer overflow-hidden rounded-full bg-muted ${AVATAR_RING}`}
          onClick={() => setModalOpen(true)}
          role="button"
          tabIndex={0}
          aria-label={t('title')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setModalOpen(true)
            }
          }}
        >
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewSrc} alt="" aria-hidden="true" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <User className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="h-6 w-6 text-white" aria-hidden="true" />
          </div>
        </div>
      </div>

      <PhotoUploadModal
        open={modalOpen}
        currentPhotoKey={previewSrc ? '__present__' : null}
        currentPhotoSrc={previewSrc}
        lastKnownUpdate={lastKnownUpdate ?? ''}
        onClose={() => setModalOpen(false)}
        onUpdated={() => setModalOpen(false)}
        cropShape="circle"
        uploadFn={async (blob, lku) => {
          if (immediate && patientId) {
            const r = await photoApi.uploadPatientPhoto(patientId, blob, lku)
            setRefresh((n) => n + 1)
            return { photoKey: r.photoUrl, lastUpdated: r.lastUpdated }
          }
          // Deferred: capture into local form state (no patient id yet).
          const dataUrl = await blobToDataUrl(blob)
          onPhotoChange(dataUrl)
          return { photoKey: '__local__', lastUpdated: new Date().toISOString() }
        }}
        removeFn={async (lku) => {
          if (immediate && patientId) {
            const r = await photoApi.removePatientPhoto(patientId, lku)
            setRefresh((n) => n + 1)
            return { lastUpdated: r.lastUpdated }
          }
          onPhotoChange(null)
          return { lastUpdated: new Date().toISOString() }
        }}
        labels={{
          title: t('title'), uploadFile: t('uploadFile'), takePhoto: t('takePhoto'), remove: t('remove'),
          confirmRemove: t('confirmRemove'), formatsHint: t('formatsHint'), cameraStarting: t('cameraStarting'),
          back: t('back'), capture: t('capture'), cropHint: t('cropHint'), usePhoto: t('usePhoto'),
          saving: t('saving'), cancel: t('cancel'), retry: t('retry'), offline: t('offline'),
          tooLarge: t('tooLarge'), conflict: t('conflict'), saveFailed: t('saveFailed'),
        }}
      />
    </Card>
  )
}
