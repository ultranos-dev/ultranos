'use client'

import { useEffect, useState } from 'react'
import { Camera } from '../../icons.js'
import { Avatar } from '../ui/avatar.js'
import { PhotoUploadModal, type PhotoUploadLabels } from './photo-upload-modal.js'

export interface PhotoAvatarFieldProps {
  /** Display name (initials + color fallback). */
  name: string
  /** Current storage key or null. */
  photoKey: string | null
  /** Record's updatedAt (optimistic concurrency). */
  lastKnownUpdate: string
  /** App-provided: sign a storage key → a preview URL (or null). */
  signUrl: (key: string) => Promise<string | null>
  /** App-provided upload; returns the new key + timestamp. */
  uploadFn: (blob: Blob, lastKnownUpdate: string) => Promise<{ photoKey: string; lastUpdated: string }>
  /** App-provided remove; omit to hide the Remove action. */
  removeFn?: (lastKnownUpdate: string) => Promise<{ lastUpdated: string }>
  onUpdated: (photoKey: string | null, lastUpdated: string) => void
  size?: number
  buttonLabel?: string
  labels?: Partial<PhotoUploadLabels>
}

/**
 * Avatar + "Change Photo" control for Settings ("edit my own photo"). Uses the shared
 * PhotoUploadModal (file / camera / crop). App-agnostic: the app injects signUrl/upload/remove.
 */
export function PhotoAvatarField({
  name, photoKey, lastKnownUpdate, signUrl, uploadFn, removeFn, onUpdated,
  size = 96, buttonLabel = 'Change Photo', labels,
}: PhotoAvatarFieldProps) {
  const [src, setSrc] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!photoKey) { setSrc(null); return }
    signUrl(photoKey).then((u) => { if (!cancelled) setSrc(u) }).catch(() => { if (!cancelled) setSrc(null) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={buttonLabel}
        title={buttonLabel}
        className="group relative shrink-0 rounded-full"
        style={{ width: size, height: size }}
      >
        <Avatar src={src} name={name} size={size} />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition group-hover:opacity-100">
          <Camera className="h-6 w-6 text-white" />
        </span>
      </button>

      <PhotoUploadModal
        open={open}
        currentPhotoKey={photoKey}
        currentPhotoSrc={src}
        lastKnownUpdate={lastKnownUpdate}
        onClose={() => setOpen(false)}
        onUpdated={(k, l) => { setOpen(false); onUpdated(k, l) }}
        uploadFn={uploadFn}
        removeFn={removeFn}
        cropShape="circle"
        labels={labels}
      />
    </>
  )
}
