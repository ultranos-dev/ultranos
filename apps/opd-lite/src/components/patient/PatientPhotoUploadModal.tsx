'use client'

import { useTranslations } from 'next-intl'
import { PhotoUploadModal } from '@ultranos/ui-kit/components/photo/photo-upload-modal'
import { uploadPatientPhoto, removePatientPhoto } from '@/lib/patient-photo-api'

interface Props {
  open: boolean
  patientId: string
  /** Storage key of the current photo, or null. Drives the Remove affordance. */
  currentPhotoKey: string | null
  /** Signed URL for the current photo (from the avatar), shown in the preview. */
  currentPhotoSrc?: string | null
  lastKnownUpdate: string
  onClose: () => void
  onUpdated: (photoKey: string | null, lastUpdated: string) => void
}

/**
 * Patient photo upload — a thin adapter over the shared ui-kit PhotoUploadModal.
 * Behaviour is unchanged; the modal/cropper/webcam now live in ui-kit and are
 * reused by admin-portal (staff photos). Patient strings are supplied from the
 * `patientPhoto` i18n namespace.
 */
export function PatientPhotoUploadModal({
  open, patientId, currentPhotoKey, currentPhotoSrc, lastKnownUpdate, onClose, onUpdated,
}: Props) {
  const t = useTranslations('patientPhoto')
  return (
    <PhotoUploadModal
      open={open}
      currentPhotoKey={currentPhotoKey}
      currentPhotoSrc={currentPhotoSrc}
      lastKnownUpdate={lastKnownUpdate}
      onClose={onClose}
      onUpdated={onUpdated}
      cropShape="circle"
      uploadFn={async (blob, lku) => {
        const r = await uploadPatientPhoto(patientId, blob, lku)
        return { photoKey: r.photoUrl, lastUpdated: r.lastUpdated }
      }}
      removeFn={async (lku) => removePatientPhoto(patientId, lku)}
      labels={{
        title: t('title'), uploadFile: t('uploadFile'), takePhoto: t('takePhoto'), remove: t('remove'),
        confirmRemove: t('confirmRemove'), formatsHint: t('formatsHint'), cameraStarting: t('cameraStarting'),
        back: t('back'), capture: t('capture'), cropHint: t('cropHint'), usePhoto: t('usePhoto'),
        saving: t('saving'), cancel: t('cancel'), retry: t('retry'), offline: t('offline'),
        tooLarge: t('tooLarge'), conflict: t('conflict'), saveFailed: t('saveFailed'),
      }}
    />
  )
}
