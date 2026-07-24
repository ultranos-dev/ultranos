// apps/opd-lite/src/__tests__/patient-photo-upload-modal.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
vi.mock('@ultranos/ui-kit/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))
vi.mock('@ultranos/ui-kit', () => ({ Alert: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div> }))
vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, ...p }: React.ComponentProps<'button'>) => <button {...p}>{children}</button>,
}))
// Cropper stub: a button that emits a cropped data URL.
vi.mock('@/components/patient/PhotoCropper', () => ({
  PhotoCropper: (_p: unknown) => <div>cropper</div>,
  __esModule: true,
}))
const uploadPatientPhoto = vi.fn()
const removePatientPhoto = vi.fn()
vi.mock('@/lib/patient-photo-api', () => ({
  uploadPatientPhoto: (...a: unknown[]) => uploadPatientPhoto(...a),
  removePatientPhoto: (...a: unknown[]) => removePatientPhoto(...a),
}))
vi.mock('@/hooks/useWebcamCapture', () => ({
  useWebcamCapture: () => ({ state: { stream: null, status: 'idle', error: null }, start: vi.fn(), stop: vi.fn(), capture: () => null }),
}))

import { PatientPhotoUploadModal } from '@/components/patient/PatientPhotoUploadModal'

const PID = '5d60f549-6fd0-4633-8746-2877d3f62abb'
function setup(overrides: Partial<React.ComponentProps<typeof PatientPhotoUploadModal>> = {}) {
  const onUpdated = vi.fn()
  const onClose = vi.fn()
  render(
    <PatientPhotoUploadModal
      open patientId={PID} currentPhotoKey={null} lastKnownUpdate="LKU"
      onClose={onClose} onUpdated={onUpdated} {...overrides}
    />,
  )
  return { onUpdated, onClose }
}

describe('PatientPhotoUploadModal', () => {
  beforeEach(() => { vi.clearAllMocks(); Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }) })

  it('shows the source step with upload/take-photo actions', () => {
    setup()
    expect(screen.getByText('uploadFile')).toBeDefined()
    expect(screen.getByText('takePhoto')).toBeDefined()
  })

  it('disables actions and warns when offline', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    setup()
    expect(screen.getByText('offline')).toBeDefined()
    expect((screen.getByText('uploadFile') as HTMLButtonElement).disabled).toBe(true)
  })

  it('removes the photo via the API and reports the update', async () => {
    removePatientPhoto.mockResolvedValue({ lastUpdated: 'T2' })
    const { onUpdated } = setup({ currentPhotoKey: `${PID}.webp` })
    fireEvent.click(screen.getByText('remove'))        // arms confirm
    fireEvent.click(screen.getByText('confirmRemove')) // confirms
    await waitFor(() => expect(removePatientPhoto).toHaveBeenCalledWith(PID, 'LKU'))
    expect(onUpdated).toHaveBeenCalledWith(null, 'T2')
  })

  it('renders in RTL without crashing (dir=rtl)', () => {
    document.documentElement.dir = 'rtl'
    setup()
    expect(screen.getByText('uploadFile')).toBeDefined()
    document.documentElement.dir = 'ltr'
  })
})
