import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (k: string) => k,
}))

// Stub the shared form so these tests focus on the modal shells + wiring.
vi.mock('@/components/registration/PatientRegistrationForm', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PatientRegistrationForm: (props: any) => (
    <div
      data-testid="reg-form"
      data-mode={props.editContext ? 'edit' : 'create'}
      data-prefill={props.prefilledNameGiven ?? ''}
      data-patient-id={props.editContext?.patientId ?? ''}
    >
      <button
        data-testid="form-cancel"
        onClick={props.editContext ? props.editContext.onCancel : props.onCancel}
      >
        cancel
      </button>
      {props.editContext && (
        <button data-testid="form-save" onClick={() => props.editContext.onSaved({ id: 'p1' })}>
          save
        </button>
      )}
    </div>
  ),
}))

const mockFetchAllergies = vi.fn().mockResolvedValue([])
vi.mock('@/lib/trpc', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchPatientAllergiesFromHub: (...args: any[]) => mockFetchAllergies(...args),
}))

import { PatientCreateModal } from '@/components/patient/PatientCreateModal'
import { PatientEditModal } from '@/components/patient/PatientEditModal'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const patient = {
  id: 'p1', resourceType: 'Patient', name: [{ text: 'A' }],
  _ultranos: { nameLocal: 'A' }, meta: { lastUpdated: '2026-01-01T00:00:00Z' },
} as any

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchAllergies.mockResolvedValue([])
})

describe('PatientCreateModal', () => {
  it('renders nothing when closed', () => {
    render(<PatientCreateModal open={false} onClose={vi.fn()} />)
    expect(screen.queryByTestId('reg-form')).toBeNull()
  })

  it('renders the shared form in create mode with the name prefill when open', () => {
    render(<PatientCreateModal open prefilledNameGiven="Ahmad" onClose={vi.fn()} />)
    const form = screen.getByTestId('reg-form')
    expect(form.getAttribute('data-mode')).toBe('create')
    expect(form.getAttribute('data-prefill')).toBe('Ahmad')
  })

  it('Cancel (form) closes the modal', () => {
    const onClose = vi.fn()
    render(<PatientCreateModal open onClose={onClose} />)
    fireEvent.click(screen.getByTestId('form-cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape closes the modal', () => {
    const onClose = vi.fn()
    render(<PatientCreateModal open onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('PatientEditModal', () => {
  it('renders nothing when closed', () => {
    render(<PatientEditModal open={false} patient={patient} patientId="p1" onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.queryByTestId('reg-form')).toBeNull()
  })

  it('loads the patient allergies, then renders the shared form in edit mode', async () => {
    render(<PatientEditModal open patient={patient} patientId="p1" onClose={vi.fn()} onSaved={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('reg-form')).toBeDefined())
    const form = screen.getByTestId('reg-form')
    expect(form.getAttribute('data-mode')).toBe('edit')
    expect(form.getAttribute('data-patient-id')).toBe('p1')
    expect(mockFetchAllergies).toHaveBeenCalledWith('p1')
  })

  it('closes the modal and forwards the patient on successful save', async () => {
    const onClose = vi.fn()
    const onSaved = vi.fn()
    render(<PatientEditModal open patient={patient} patientId="p1" onClose={onClose} onSaved={onSaved} />)
    await waitFor(() => expect(screen.getByTestId('reg-form')).toBeDefined())
    fireEvent.click(screen.getByTestId('form-save'))
    expect(onSaved).toHaveBeenCalledWith({ id: 'p1' })
    expect(onClose).toHaveBeenCalled()
  })
})
