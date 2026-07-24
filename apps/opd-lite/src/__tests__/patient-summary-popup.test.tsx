import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PatientSummaryPopup } from '../components/appointments/PatientSummaryPopup'
import type { FhirAppointmentZod, AppointmentStatus } from '@ultranos/shared-types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

const nowIso = new Date().toISOString()

function makeAppointment(overrides: Partial<FhirAppointmentZod> = {}): FhirAppointmentZod {
  return {
    id: 'apt-001',
    resourceType: 'Appointment',
    status: 'booked',
    serviceType: [{ system: 'http://terminology.hl7.org/CodeSystem/service-type', code: 'new-consult', display: 'New Consult' }],
    start: nowIso,
    end: nowIso,
    participant: [
      { actor: { reference: 'Patient/p-001', display: 'Ahmad K.' }, status: 'accepted' },
    ],
    _ultranos: {
      walkIn: false,
      queuePosition: null,
      isOfflineCreated: false,
      hlcTimestamp: Date.now().toString(),
      createdAt: nowIso,
    },
    meta: { lastUpdated: nowIso, versionId: '1' },
    ...overrides,
  } as FhirAppointmentZod
}

describe('PatientSummaryPopup', () => {
  it('renders patient name in DialogTitle when open', () => {
    render(
      <PatientSummaryPopup
        appointment={makeAppointment()}
        onClose={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Ahmad K.')).toBeInTheDocument()
    // Radix Dialog renders with role=dialog
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('calls onClose when the built-in dialog close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <PatientSummaryPopup
        appointment={makeAppointment()}
        onClose={onClose}
        onStatusChange={vi.fn()}
      />,
    )
    // DialogContent renders a built-in X close button with sr-only text "Close" (exact)
    const closeBtn = screen.getByRole('button', { name: 'Close' })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onStatusChange when a status option is selected', async () => {
    const onStatusChange = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(
      <PatientSummaryPopup
        appointment={makeAppointment()}
        onClose={onClose}
        onStatusChange={onStatusChange}
      />,
    )
    // Open the status dropdown
    fireEvent.click(screen.getByText('changeStatus'))

    // Click a status option
    fireEvent.click(screen.getByText('checkedIn'))

    expect(onStatusChange).toHaveBeenCalledWith('apt-001', 'arrived')
  })

  it('shows allergy warning in red when allergyStatus is present', () => {
    render(
      <PatientSummaryPopup
        appointment={makeAppointment()}
        onClose={vi.fn()}
        onStatusChange={vi.fn()}
        allergyStatus="present"
      />,
    )
    const allergyText = screen.getByText(/Present/)
    expect(allergyText.className).toContain('text-destructive')
  })

  it('renders age when provided', () => {
    render(
      <PatientSummaryPopup
        appointment={makeAppointment()}
        onClose={vi.fn()}
        onStatusChange={vi.fn()}
        patientAge={34}
      />,
    )
    expect(screen.getByText('34')).toBeInTheDocument()
  })
})
