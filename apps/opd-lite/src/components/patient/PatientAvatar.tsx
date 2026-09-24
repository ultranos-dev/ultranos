'use client'

import { useEffect, useState } from 'react'
import type { FhirPatient } from '@ultranos/shared-types'
import { Camera } from '@ultranos/ui-kit/icons'
import { AVATAR_RING } from '@ultranos/ui-kit/components/ui/avatar'
import { getPatientPhotoUrl } from '@/lib/patient-photo-api'
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
  const [refresh, setRefresh] = useState(0)

  // Story 56.2 / audit C-HUB-4: the raw photo storage path is no longer returned
  // to clients. Fetch a short-lived signed URL from the Hub by patient id (the key
  // is resolved and signed server-side). Refetched after an upload/remove via the
  // `refresh` bump. Any failure / no-photo degrades to the initials fallback.
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    ;(async () => {
      const url = await getPatientPhotoUrl(patientId, controller.signal)
      if (!cancelled) setPhotoSrc(url)
    })()
    return () => { cancelled = true; controller.abort() }
  }, [patientId, refresh])

  const initials = getInitials(patient)

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`group relative cursor-pointer overflow-hidden rounded-full ${AVATAR_RING}`}
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
        // The client no longer holds the raw key (Story 56.2); a non-null sentinel
        // when a photo is present just drives the modal's Remove affordance (removal
        // is by patientId). Null → no photo → no Remove shown.
        currentPhotoKey={photoSrc ? '__present__' : null}
        currentPhotoSrc={photoSrc}
        lastKnownUpdate={patient.meta.lastUpdated}
        onClose={() => setModalOpen(false)}
        onUpdated={(key, lastUpdated) => {
          setModalOpen(false)
          setRefresh((n) => n + 1) // refetch the signed URL after upload/remove
          onPhotoUpdated?.(key, lastUpdated)
        }}
      />
    </div>
  )
}
