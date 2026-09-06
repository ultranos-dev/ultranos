import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Router mock — the page redirects an empty store back to /scan and is the
// landing target for both the scanner and the queue.
const mockReplace = vi.fn()
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}))

// Auth session store — dispense orchestration reads practitioner identity here.
const mockGetPractitionerRef = vi.fn().mockReturnValue('Practitioner/practitioner-abc-123')
const mockGetAccessToken = vi.fn().mockResolvedValue('test-token')
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ session: { userId: 'u1', practitionerId: 'practitioner-abc-123', role: 'PHARMACIST', sessionId: 's1' } }),
    {
      getState: () => ({
        session: { userId: 'u1', practitionerId: 'practitioner-abc-123', role: 'PHARMACIST', sessionId: 's1' },
        getPractitionerRef: mockGetPractitionerRef,
        getAccessToken: mockGetAccessToken,
      }),
    },
  ),
}))

// Stub the confirmation modal so tests exercise the page's onConfirm wiring
// without driving the modal's interaction-check / acknowledge gates (those are
// covered by DispensingConfirmationModal's own tests).
vi.mock('@/components/pharmacy/DispensingConfirmationModal', () => ({
  DispensingConfirmationModal: ({ onConfirm }: { onConfirm: () => void }) => (
    <div data-testid="mock-modal">
      <button data-testid="modal-confirm" onClick={onConfirm}>Confirm</button>
    </div>
  ),
}))

import FulfillmentPage from '@/app/[locale]/(app)/fulfillment/page'
import { useFulfillmentStore } from '@/stores/fulfillment-store'
import type { VerifiedPrescription } from '@/lib/prescription-verify'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const sampleRx: VerifiedPrescription[] = [
  {
    id: 'rx-001',
    med: 'AMX500',
    medN: 'Amoxicillin',
    medT: 'Amoxicillin 500mg Capsule',
    dos: { qty: 1, unit: 'capsule', freqN: 3, per: 1, perU: 'd' },
    dur: 7,
    req: 'pract-001',
    pat: 'pat-001',
    at: '2026-04-28T10:00:00Z',
  },
]

beforeEach(async () => {
  useFulfillmentStore.getState().reset()
  vi.clearAllMocks()
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ result: { data: { json: { success: true, dispenseId: 'd-1', prescriptionStatus: 'completed' } } } }),
  })
  await db.delete()
  await db.open()
  if (!encryptionKeyStore.isReady()) {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    encryptionKeyStore.setKey(key)
  }
})

describe('FulfillmentPage', () => {
  it('records a MedicationDispense when the pharmacist confirms', async () => {
    useFulfillmentStore.getState().loadPrescriptions(sampleRx, 'Dr. Ahmad', { name: 'Fatima', age: 34 })
    const user = userEvent.setup()
    render(<FulfillmentPage />)

    await user.click(screen.getByTestId('confirm-dispensing-btn'))
    await user.click(screen.getByTestId('modal-confirm'))

    await waitFor(async () => {
      const dispenses = await db.dispenses.toArray()
      expect(dispenses).toHaveLength(1)
    })
  })

  it('redirects to /scan when no prescriptions are loaded', () => {
    render(<FulfillmentPage />)
    expect(mockReplace).toHaveBeenCalledWith('/scan')
  })
})
