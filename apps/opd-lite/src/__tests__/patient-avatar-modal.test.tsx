// apps/opd-lite/src/__tests__/patient-avatar-modal.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { FhirPatient } from '@ultranos/shared-types'

// Story 56.2 / audit C-HUB-4: PatientAvatar no longer signs a client-held storage
// key. It fetches a short-lived signed URL from the Hub BY PATIENT ID (the key is
// resolved + signed server-side and never returned to the client).
const getPatientPhotoUrl = vi.fn().mockResolvedValue('https://signed/x')
vi.mock('@/lib/patient-photo-api', () => ({
  getPatientPhotoUrl: (...args: unknown[]) => getPatientPhotoUrl(...args),
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
  beforeEach(() => {
    vi.clearAllMocks()
    getPatientPhotoUrl.mockResolvedValue('https://signed/x')
  })

  it('fetches the signed photo URL from the Hub by patient id (server-resolved key, not a client-held path)', async () => {
    const { container } = render(<PatientAvatar patient={patient} patientId={PID} />)
    // Requested by patient id — the client never holds/derives the raw storage key.
    await waitFor(() => expect(getPatientPhotoUrl).toHaveBeenCalledWith(PID, expect.anything()))
    // The returned signed URL is rendered as the avatar image.
    await waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toBe('https://signed/x'))
  })

  it('opens the upload modal on click and forwards the new key', () => {
    const onPhotoUpdated = vi.fn()
    render(<PatientAvatar patient={patient} patientId={PID} onPhotoUpdated={onPhotoUpdated} />)
    fireEvent.click(screen.getByRole('button', { name: /upload patient photo/i }))
    fireEvent.click(screen.getByText('modal-open'))
    expect(onPhotoUpdated).toHaveBeenCalledWith('key.webp', 'T')
  })
})
