// apps/opd-lite/src/__tests__/patient-avatar-modal.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { FhirPatient } from '@ultranos/shared-types'

const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed/x' }, error: null })
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({ storage: { from: () => ({ createSignedUrl }) } }),
}))
// Modal stub: render a marker + a button that fires onUpdated.
vi.mock('@/components/patient/PatientPhotoUploadModal', () => ({
  PatientPhotoUploadModal: ({ open, onUpdated }: { open: boolean; onUpdated: (k: string | null, u: string) => void }) =>
    open ? <button onClick={() => onUpdated('key.webp', 'T')}>modal-open</button> : null,
}))

import { PatientAvatar } from '@/components/patient/PatientAvatar'

const PID = '5d60f549-6fd0-4633-8746-2877d3f62abb'
const patient = {
  id: PID, resourceType: 'Patient', name: [{ given: ['A'], text: 'A' }],
  _ultranos: { nameGiven: 'A', nameFather: 'B', photoUrl: `${PID}.webp` }, meta: { lastUpdated: 'L' },
} as unknown as FhirPatient

describe('PatientAvatar → modal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the STORED photo key for the signed URL (not a hardcoded .jpg)', () => {
    render(<PatientAvatar patient={patient} patientId={PID} />)
    expect(createSignedUrl).toHaveBeenCalledWith(`${PID}.webp`, 3600)
  })

  it('opens the upload modal on click and forwards the new key', () => {
    const onPhotoUpdated = vi.fn()
    render(<PatientAvatar patient={patient} patientId={PID} onPhotoUpdated={onPhotoUpdated} />)
    fireEvent.click(screen.getByRole('button', { name: /upload patient photo/i }))
    fireEvent.click(screen.getByText('modal-open'))
    expect(onPhotoUpdated).toHaveBeenCalledWith('key.webp', 'T')
  })
})
