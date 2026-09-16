/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mocks ─────────────────────────────────────────────────────

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/labs',
}))

const mockGetLabDetail = vi.fn()
const mockCreateLab = vi.fn()
const mockUpdateLab = vi.fn()
const mockArchiveLab = vi.fn()
const mockReviewLab = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      getLabDetail: { query: (...args: any[]) => mockGetLabDetail(...args) },
      createLab: { mutate: (...args: any[]) => mockCreateLab(...args) },
      updateLab: { mutate: (...args: any[]) => mockUpdateLab(...args) },
      archiveLab: { mutate: (...args: any[]) => mockArchiveLab(...args) },
      reviewLab: { mutate: (...args: any[]) => mockReviewLab(...args) },
    },
  },
  setAccessToken: vi.fn(),
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  Star: () => <svg />,
  MapPin: () => <svg />,
  FlaskConical: () => <svg />,
  Microscope: () => <svg />,
  FileSearch: () => <svg />,
  ExternalLink: () => <svg />,
  Users: () => <svg />,
  CheckCircle: () => <svg />,
  XCircle: () => <svg />,
  RefreshCw: () => <svg />,
  Archive: () => <svg />,
  Edit: () => <svg />,
  Clock: () => <svg />,
  Home: () => <svg />,
  Phone: () => <svg />,
  Mail: () => <svg />,
  Globe: () => <svg />,
  X: () => <svg />,
  Inbox: () => <svg />,
}))

const mockLabDetail = {
  id: 'lab-1',
  labName: 'Alpha Lab',
  licenseReference: 'LIC-001',
  accreditationReference: 'ACC-001',
  capAccredited: true,
  status: 'PENDING',
  turnaroundTimeHours: 24,
  homeCollection: true,
  sampleCollection: true,
  specialties: ['Haematology', 'Biochemistry'],
  phone: '+93 700 123456',
  email: 'alpha@lab.com',
  address: '123 Lab Street',
  city: 'Kabul',
  contactPersonName: 'Ali Khan',
  contactPersonRole: 'Head Technician',
  contactPersonPhone: '+93 700 000001',
  latitude: 34.5,
  longitude: 69.2,
  googleMapsUrl: null,
  operatingHours: null,
  is247: false,
  logoUrl: null,
  registeredAt: '2026-05-01T00:00:00Z',
}

// ── LabProfileModal ───────────────────────────────────────────

const { LabProfileModal } = await import('../components/labs/LabProfileModal')

describe('LabProfileModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLabDetail.mockResolvedValue(mockLabDetail)
  })

  it('renders lab name and license reference from getLabDetail', async () => {
    render(
      <LabProfileModal
        open
        labId="lab-1"
        onOpenChange={() => {}}
        onEdit={() => {}}
        onChanged={() => {}}
      />
    )
    await waitFor(() => expect(screen.getByText('Alpha Lab')).toBeInTheDocument())
    expect(screen.getByText('LIC-001')).toBeInTheDocument()
  })

  it('shows PENDING status badge', async () => {
    render(
      <LabProfileModal
        open
        labId="lab-1"
        onOpenChange={() => {}}
        onEdit={() => {}}
        onChanged={() => {}}
      />
    )
    await waitFor(() => expect(screen.getByText('PENDING')).toBeInTheDocument())
  })

  it('calls reviewLab with APPROVE for a PENDING lab', async () => {
    mockReviewLab.mockResolvedValue({})
    const user = userEvent.setup()
    render(
      <LabProfileModal
        open
        labId="lab-1"
        onOpenChange={() => {}}
        onEdit={() => {}}
        onChanged={() => {}}
      />
    )
    await waitFor(() => expect(screen.getByText('Alpha Lab')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /approve/i }))
    await waitFor(() =>
      expect(mockReviewLab).toHaveBeenCalledWith(
        expect.objectContaining({ labId: 'lab-1', action: 'APPROVE' })
      )
    )
  })

  it('calls archiveLab after archive confirmation', async () => {
    mockArchiveLab.mockResolvedValue({})
    const user = userEvent.setup()
    render(
      <LabProfileModal
        open
        labId="lab-1"
        onOpenChange={() => {}}
        onEdit={() => {}}
        onChanged={() => {}}
      />
    )
    await waitFor(() => expect(screen.getByText('Alpha Lab')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /archive/i }))
    // Confirm dialog should appear
    await waitFor(() => expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() =>
      expect(mockArchiveLab).toHaveBeenCalledWith(expect.objectContaining({ labId: 'lab-1' }))
    )
  })
})

// ── LabFormModal ──────────────────────────────────────────────

const { LabFormModal } = await import('../components/labs/LabFormModal')

describe('LabFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateLab.mockResolvedValue({ id: 'lab-new' })
  })

  it('calls createLab with labName and licenseReference on submit', async () => {
    const user = userEvent.setup()
    render(
      <LabFormModal
        open
        onOpenChange={() => {}}
        onSaved={() => {}}
      />
    )
    await user.type(screen.getByLabelText('labs.labName'), 'Beta Lab')
    await user.type(screen.getByLabelText('labs.licenseReference'), 'LIC-999')
    await user.click(screen.getByRole('button', { name: 'common.save' }))
    await waitFor(() =>
      expect(mockCreateLab).toHaveBeenCalledWith(
        expect.objectContaining({ labName: 'Beta Lab', licenseReference: 'LIC-999' })
      )
    )
  })

  it('disables Save when required fields are empty', () => {
    render(
      <LabFormModal
        open
        onOpenChange={() => {}}
        onSaved={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled()
  })

  it('calls updateLab when initial is provided', async () => {
    mockUpdateLab.mockResolvedValue({})
    const user = userEvent.setup()
    render(
      <LabFormModal
        open
        initial={{ id: 'lab-1', labName: 'Alpha Lab', licenseReference: 'LIC-001' }}
        onOpenChange={() => {}}
        onSaved={() => {}}
      />
    )
    // name field should be pre-filled
    await waitFor(() =>
      expect((screen.getByLabelText('labs.labName') as HTMLInputElement).value).toBe('Alpha Lab')
    )
    await user.click(screen.getByRole('button', { name: 'common.save' }))
    await waitFor(() =>
      expect(mockUpdateLab).toHaveBeenCalledWith(
        expect.objectContaining({ labId: 'lab-1', labName: 'Alpha Lab' })
      )
    )
  })

  it('resets form when modal is reopened', async () => {
    const { rerender } = render(
      <LabFormModal
        open
        onOpenChange={() => {}}
        onSaved={() => {}}
      />
    )
    fireEvent.change(screen.getByLabelText('labs.labName'), { target: { value: 'Temp Lab' } })
    expect((screen.getByLabelText('labs.labName') as HTMLInputElement).value).toBe('Temp Lab')

    rerender(<LabFormModal open={false} onOpenChange={() => {}} onSaved={() => {}} />)
    rerender(<LabFormModal open onOpenChange={() => {}} onSaved={() => {}} />)
    expect((screen.getByLabelText('labs.labName') as HTMLInputElement).value).toBe('')
  })
})
