import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PrescriptionQR } from '@/components/clinical/PrescriptionQR'
import type { FhirMedicationRequestZod } from '@ultranos/shared-types'

// Mock the signing module
const mockSignBundle = vi.fn()
vi.mock('@/lib/prescription-signing', () => ({
  signPrescriptionBundle: (...args: unknown[]) => mockSignBundle(...args),
}))

function makeMockRx(overrides?: Partial<FhirMedicationRequestZod>): FhirMedicationRequestZod {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    medicationCodeableConcept: {
      coding: [{ system: 'urn:ultranos:formulary', code: 'AMX500', display: 'Amoxicillin' }],
      text: 'Amoxicillin 500mg (Capsule)',
    },
    subject: { reference: 'Patient/p-123' },
    encounter: { reference: 'Encounter/e-456' },
    requester: { reference: 'Practitioner/dr-789' },
    authoredOn: '2026-04-29T10:00:00.000Z',
    dosageInstruction: [
      {
        sequence: 1,
        text: '1 capsule, TID, for 7 days',
        doseAndRate: [{ doseQuantity: { value: 1, unit: 'capsule' } }],
      },
    ],
    dispenseRequest: { expectedSupplyDuration: { value: 7, unit: 'd' } },
    _ultranos: {
      prescriptionStatus: 'ACTIVE' as never,
      interactionCheckResult: 'CLEAR',
      isOfflineCreated: true,
      hlcTimestamp: '000001746000000000:00001:node1',
      createdAt: '2026-04-29T10:00:00.000Z',
    },
    meta: { lastUpdated: '2026-04-29T10:00:00.000Z', versionId: '1' },
    ...overrides,
  }
}

describe('PrescriptionQR', () => {
  const mockPrivateKey = new Uint8Array(32).fill(0x01)
  const mockPublicKey = new Uint8Array(32).fill(0x02)

  beforeEach(() => {
    mockSignBundle.mockReset()
    mockSignBundle.mockResolvedValue({
      payload: '{"test":"data"}',
      sig: 'AAAA',
      pub: 'BBBB',
      issued_at: '2026-04-29T10:00:00.000Z',
      expiry: '2026-05-29T10:00:00.000Z',
    })
  })

  it('renders a "Finalize & Generate QR" button', () => {
    render(
      <PrescriptionQR
        prescriptions={[makeMockRx()]}
        privateKey={mockPrivateKey}
        publicKey={mockPublicKey}
      />,
    )
    expect(screen.getByRole('button', { name: /finalize/i })).toBeInTheDocument()
  })

  it('generates and displays a QR code when finalize is clicked', async () => {
    const user = userEvent.setup()
    render(
      <PrescriptionQR
        prescriptions={[makeMockRx()]}
        privateKey={mockPrivateKey}
        publicKey={mockPublicKey}
      />,
    )

    await user.click(screen.getByRole('button', { name: /finalize/i }))

    await waitFor(() => {
      expect(screen.getByTestId('prescription-qr-code')).toBeInTheDocument()
    })
  })

  it('shows a success heading after QR generation', async () => {
    const user = userEvent.setup()
    render(
      <PrescriptionQR
        prescriptions={[makeMockRx()]}
        privateKey={mockPrivateKey}
        publicKey={mockPublicKey}
      />,
    )

    await user.click(screen.getByRole('button', { name: /finalize/i }))

    await waitFor(() => {
      expect(screen.getByText(/prescription finalized/i)).toBeInTheDocument()
    })
  })

  it('calls signPrescriptionBundle with prescriptions, private key, and public key', async () => {
    const user = userEvent.setup()
    const rxList = [makeMockRx()]
    render(
      <PrescriptionQR
        prescriptions={rxList}
        privateKey={mockPrivateKey}
        publicKey={mockPublicKey}
      />,
    )

    await user.click(screen.getByRole('button', { name: /finalize/i }))

    await waitFor(() => {
      expect(mockSignBundle).toHaveBeenCalledWith(rxList, mockPrivateKey, mockPublicKey)
    })
  })

  it('shows error state if signing fails', async () => {
    mockSignBundle.mockRejectedValue(new Error('Signing failed'))
    const user = userEvent.setup()
    render(
      <PrescriptionQR
        prescriptions={[makeMockRx()]}
        privateKey={mockPrivateKey}
        publicKey={mockPublicKey}
      />,
    )

    await user.click(screen.getByRole('button', { name: /finalize/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('disables the finalize button when no prescriptions', () => {
    render(
      <PrescriptionQR
        prescriptions={[]}
        privateKey={mockPrivateKey}
        publicKey={mockPublicKey}
      />,
    )
    expect(screen.getByRole('button', { name: /finalize/i })).toBeDisabled()
  })

  it('shows loading state while signing', async () => {
    let resolveSign!: (value: { payload: string; sig: string; pub: string; issued_at: string; expiry: string }) => void
    mockSignBundle.mockReturnValue(new Promise((resolve) => { resolveSign = resolve }))

    const user = userEvent.setup()
    render(
      <PrescriptionQR
        prescriptions={[makeMockRx()]}
        privateKey={mockPrivateKey}
        publicKey={mockPublicKey}
      />,
    )

    await user.click(screen.getByRole('button', { name: /finalize/i }))

    expect(screen.getByText(/signing/i)).toBeInTheDocument()

    resolveSign({ payload: '{}', sig: 'AA==', pub: 'BB==', issued_at: '2026-04-29T10:00:00.000Z', expiry: '2026-05-29T10:00:00.000Z' })

    await waitFor(() => {
      expect(screen.queryByText(/signing/i)).not.toBeInTheDocument()
    })
  })

  it('shows a print button after QR generation', async () => {
    const user = userEvent.setup()
    render(
      <PrescriptionQR
        prescriptions={[makeMockRx()]}
        privateKey={mockPrivateKey}
        publicKey={mockPublicKey}
      />,
    )

    await user.click(screen.getByRole('button', { name: /finalize/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument()
    })
  })
})
