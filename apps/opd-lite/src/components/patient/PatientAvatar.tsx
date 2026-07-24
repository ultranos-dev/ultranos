'use client'

import { useEffect, useState } from 'react'
import type { FhirPatient } from '@ultranos/shared-types'
import { Camera } from '@ultranos/ui-kit/icons'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { PatientPhotoUploadModal } from '@/components/patient/PatientPhotoUploadModal'

interface PatientAvatarProps {
  patient: FhirPatient
  patientId: string
  size?: number
  onPhotoUpdated?: (photoKey: string | null, lastUpdated?: string) => void
}

function idToColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 45%, 55%)`
}
function getInitials(patient: FhirPatient): string {
  const g = patient._ultranos.nameGiven?.charAt(0) ?? ''
  const f = patient._ultranos.nameFather?.charAt(0) ?? ''
  return (g + f) || '?'
}

export function PatientAvatar({ patient, patientId, size = 80, onPhotoUpdated }: PatientAvatarProps) {
  const [photoSrc, setPhotoSrc] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const photoKey = patient._ultranos.photoUrl ?? null

  useEffect(() => {
    if (!photoKey) { setPhotoSrc(null); return }
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await getSupabaseBrowserClient().storage
          .from('patient-photos').createSignedUrl(photoKey, 3600)
        if (!cancelled && data?.signedUrl && !error) setPhotoSrc(data.signedUrl)
      } catch { /* show initials fallback */ }
    })()
    return () => { cancelled = true }
  }, [photoKey])

  const initials = getInitials(patient)

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="group relative cursor-pointer overflow-hidden rounded-full"
        style={{ width: size, height: size }}
        onClick={() => setModalOpen(true)}
        role="button" tabIndex={0} aria-label="Upload patient photo"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setModalOpen(true) } }}
      >
        {photoSrc ? (
          <img src={photoSrc} alt="" className="h-full w-full object-cover" aria-hidden="true" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white font-bold select-none"
            style={{ backgroundColor: idToColor(patientId), fontSize: size * 0.35 }} aria-hidden="true">
            {initials}
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <Camera className="h-6 w-6 text-white" aria-hidden="true" />
        </div>
      </div>

      <PatientPhotoUploadModal
        open={modalOpen}
        patientId={patientId}
        currentPhotoKey={photoKey}
        currentPhotoSrc={photoSrc}
        lastKnownUpdate={patient.meta.lastUpdated}
        onClose={() => setModalOpen(false)}
        onUpdated={(key, lastUpdated) => { setModalOpen(false); onPhotoUpdated?.(key, lastUpdated) }}
      />
    </div>
  )
}
