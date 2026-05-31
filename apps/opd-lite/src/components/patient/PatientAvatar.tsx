'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { FhirPatient } from '@ultranos/shared-types'
import { Camera } from '@ultranos/ui-kit/icons'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'

interface PatientAvatarProps {
  patient: FhirPatient
  patientId: string
  size?: number
  onPhotoUpdated?: (photoUrl: string) => void
}

/** Deterministic background color from patientId hash. */
function idToColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 45%, 55%)`
}

/** Extract initials: first char of nameGiven + first char of nameFather. */
function getInitials(patient: FhirPatient): string {
  const g = patient._ultranos.nameGiven?.charAt(0) ?? ''
  const f = patient._ultranos.nameFather?.charAt(0) ?? ''
  return (g + f) || '?'
}

/** Resize image via canvas to max 400x400, JPEG 80% quality. */
function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const maxDim = 400
      let w = img.width
      let h = img.height

      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas context unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('Failed to create image blob'))
        },
        'image/jpeg',
        0.8,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    img.src = url
  })
}

/**
 * Circular patient avatar with photo upload support.
 *
 * - Shows patient photo from Supabase Storage if available
 * - Falls back to deterministic-color initials
 * - Camera overlay on hover for photo capture
 * - Client-side resize to 400x400 before upload
 * - Audit event emitted on photo upload
 * - Offline-aware: shows error when upload attempted without connectivity
 */
export function PatientAvatar({
  patient,
  patientId,
  size = 80,
  onPhotoUpdated,
}: PatientAvatarProps) {
  const [photoSrc, setPhotoSrc] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch signed URL for existing photo
  useEffect(() => {
    if (!patient._ultranos.photoUrl) return

    let cancelled = false
    async function fetchSignedUrl() {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data, error: urlError } = await supabase.storage
          .from('patient-photos')
          .createSignedUrl(`${patientId}.jpg`, 3600)

        if (!cancelled && data?.signedUrl && !urlError) {
          setPhotoSrc(data.signedUrl)
        }
      } catch {
        // Fail silently — show initials fallback
      }
    }
    fetchSignedUrl()
    return () => { cancelled = true }
  }, [patient._ultranos.photoUrl, patientId])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      // Reset input so same file can be re-selected
      e.target.value = ''

      // Offline check
      if (!navigator.onLine) {
        setError('Photo upload requires internet connection')
        return
      }

      setError(null)
      setUploading(true)

      try {
        const blob = await resizeImage(file)
        const supabase = getSupabaseBrowserClient()

        const { error: uploadError } = await supabase.storage
          .from('patient-photos')
          .upload(`${patientId}.jpg`, blob, {
            upsert: true,
            contentType: 'image/jpeg',
          })

        if (uploadError) {
          throw uploadError
        }

        // Audit the photo upload
        auditPhiAccess(
          AuditAction.UPDATE,
          AuditResourceType.PATIENT,
          patientId,
          patientId,
          { phiAccess: 'photo_upload' },
        )

        // Get signed URL for display
        const { data: urlData } = await supabase.storage
          .from('patient-photos')
          .createSignedUrl(`${patientId}.jpg`, 3600)

        if (urlData?.signedUrl) {
          setPhotoSrc(urlData.signedUrl)
        }

        const storagePath = `${patientId}.jpg`
        onPhotoUpdated?.(storagePath)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Photo upload failed',
        )
      } finally {
        setUploading(false)
      }
    },
    [patientId, onPhotoUpdated],
  )

  const initials = getInitials(patient)
  const bgColor = idToColor(patientId)

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="group relative cursor-pointer overflow-hidden rounded-full"
        style={{ width: size, height: size }}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload patient photo"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
      >
        {photoSrc ? (
          <img
            src={photoSrc}
            alt=""
            className="h-full w-full object-cover"
            aria-hidden="true"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-white font-bold select-none"
            style={{
              backgroundColor: bgColor,
              fontSize: size * 0.35,
            }}
            aria-hidden="true"
          >
            {initials}
          </div>
        )}

        {/* Camera overlay on hover */}
        {!uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="h-6 w-6 text-white" aria-hidden="true" />
          </div>
        )}

        {/* Upload spinner overlay */}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <svg
              className="h-6 w-6 animate-spin text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-label="Uploading photo"
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
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
      />

      {/* Error text below avatar */}
      {error && (
        <p className="mt-1 max-w-[200px] text-center text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
