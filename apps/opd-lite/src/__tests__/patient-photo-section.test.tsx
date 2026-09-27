import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { PatientPhotoSection } from '@ultranos/patient-kit/components/registration/patient-photo-section'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
vi.mock('@ultranos/ui-kit/components/photo/photo-upload-modal', () => ({ PhotoUploadModal: () => null }))
vi.mock('@ultranos/ui-kit/components/ui/avatar', () => ({ AVATAR_RING: '' }))
vi.mock('@ultranos/ui-kit/icons', () => ({ Camera: () => null, User: () => null }))

// Photo transport is now injected (PatientPhotoApi) rather than imported from @/lib.
const getPatientPhotoUrl = vi.fn().mockResolvedValue(null)
const photoApi = {
  getPatientPhotoUrl,
  uploadPatientPhoto: vi.fn().mockResolvedValue({ photoUrl: 'k', lastUpdated: 't' }),
  removePatientPhoto: vi.fn().mockResolvedValue({ lastUpdated: 't' }),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PatientPhotoSection modes', () => {
  it('edit mode (patientId) loads the current photo from the Hub', () => {
    render(
      <PatientPhotoSection
        photoDataUrl={null}
        onPhotoChange={vi.fn()}
        patientId="p1"
        lastKnownUpdate="t"
        photoApi={photoApi}
      />,
    )
    expect(getPatientPhotoUrl).toHaveBeenCalledWith('p1', expect.anything())
  })

  it('create mode (no patientId) does not fetch a server photo (deferred capture)', () => {
    render(
      <PatientPhotoSection photoDataUrl={null} onPhotoChange={vi.fn()} photoApi={photoApi} />,
    )
    expect(getPatientPhotoUrl).not.toHaveBeenCalled()
  })
})
