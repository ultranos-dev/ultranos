import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
vi.mock('@ultranos/ui-kit/components/photo/photo-upload-modal', () => ({ PhotoUploadModal: () => null }))
vi.mock('@ultranos/ui-kit/components/ui/avatar', () => ({ AVATAR_RING: '' }))
vi.mock('@ultranos/ui-kit/icons', () => ({ Camera: () => null, User: () => null }))
vi.mock('@/components/Card', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Card: ({ children }: any) => <div>{children}</div>,
}))

const getPatientPhotoUrl = vi.fn().mockResolvedValue(null)
vi.mock('@/lib/patient-photo-api', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getPatientPhotoUrl: (...a: any[]) => getPatientPhotoUrl(...a),
  uploadPatientPhoto: vi.fn(),
  removePatientPhoto: vi.fn(),
}))

import { PatientPhotoSection } from '@/components/registration/PatientPhotoSection'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PatientPhotoSection modes', () => {
  it('edit mode (patientId) loads the current photo from the Hub', () => {
    render(<PatientPhotoSection photoDataUrl={null} onPhotoChange={vi.fn()} patientId="p1" lastKnownUpdate="t" />)
    expect(getPatientPhotoUrl).toHaveBeenCalledWith('p1', expect.anything())
  })

  it('create mode (no patientId) does not fetch a server photo (deferred capture)', () => {
    render(<PatientPhotoSection photoDataUrl={null} onPhotoChange={vi.fn()} />)
    expect(getPatientPhotoUrl).not.toHaveBeenCalled()
  })
})
