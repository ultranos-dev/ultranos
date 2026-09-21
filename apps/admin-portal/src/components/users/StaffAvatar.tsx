'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { PhotoUploadModal } from '@ultranos/ui-kit/components/photo/photo-upload-modal'
import { Camera, User } from '@ultranos/ui-kit/icons'
import { uploadStaffPhoto, removeStaffPhoto } from '@/lib/staff-photo-api'

/**
 * Staff photo avatar + upload entry point. Reuses the shared ui-kit PhotoUploadModal
 * (same modal + features as the patient photo). The server re-encodes to WebP 512²
 * and stores the key in `practitioners.avatar_url`.
 */
export function StaffAvatar({
  practitionerId,
  photoKey,
  lastKnownUpdate,
  name,
  size = 96,
  onUpdated,
}: {
  practitionerId: string
  /** Storage key (e.g. "{id}.webp") or null. */
  photoKey: string | null
  /** Practitioner `updatedAt` for optimistic concurrency. */
  lastKnownUpdate: string
  name: string
  size?: number
  onUpdated: (photoKey: string | null, lastUpdated: string) => void
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!photoKey) { setSrc(null); return }
    getSupabaseBrowserClient().storage
      .from('staff-photos')
      .createSignedUrl(photoKey, 3600)
      .then(({ data }: { data: { signedUrl: string } | null }) => { if (!cancelled) setSrc(data?.signedUrl ?? null) })
      .catch(() => { if (!cancelled) setSrc(null) })
    return () => { cancelled = true }
  }, [photoKey])

  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Change staff photo"
        className="group relative shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-border/50 transition"
        style={{ width: size, height: size }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
            {initials || <User className="h-8 w-8" />}
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
          <Camera className="h-6 w-6 text-white" />
        </span>
      </button>

      <PhotoUploadModal
        open={open}
        currentPhotoKey={photoKey}
        currentPhotoSrc={src}
        lastKnownUpdate={lastKnownUpdate}
        onClose={() => setOpen(false)}
        onUpdated={(key, lastUpdated) => { setOpen(false); onUpdated(key, lastUpdated) }}
        uploadFn={async (blob, lku) => {
          const r = await uploadStaffPhoto(practitionerId, blob, lku)
          return { photoKey: r.photoUrl, lastUpdated: r.lastUpdated }
        }}
        removeFn={async (lku) => removeStaffPhoto(practitionerId, lku)}
        cropShape="circle"
        labels={{ title: 'Staff Photo', formatsHint: 'JPG, PNG or WebP. A square headshot works best.' }}
      />
    </>
  )
}
