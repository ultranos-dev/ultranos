import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Camera unavailable in jsdom.
vi.mock('html5-qrcode', () => ({ Html5Qrcode: vi.fn() }))

vi.mock('@/lib/prescription-verify', () => ({
  verifyPrescriptionQr: vi.fn(),
  fetchAndCachePractitionerKey: vi.fn(),
}))

const mockLoadPrescriptions = vi.fn()
const mockSetResolvedPatient = vi.fn()
vi.mock('@/stores/fulfillment-store', () => ({
  useFulfillmentStore: Object.assign(
    vi.fn(() => ({ phase: 'empty', items: [], loadPrescriptions: mockLoadPrescriptions, setResolvedPatient: mockSetResolvedPatient, reset: vi.fn() })),
    { getState: vi.fn(() => ({ loadPrescriptions: mockLoadPrescriptions, setResolvedPatient: mockSetResolvedPatient, reset: vi.fn() })) },
  ),
}))

// Story 57.1: patient resolution runs inside finishProceed — mock it so this
// 57.3 double-dispense test stays hermetic (no fake network / IndexedDB
// resolution) while still exercising the combined idempotency + resolution path.
vi.mock('@/lib/patient-resolution', () => ({
  normalizePatientRef: (ref: string) => ref.replace(/^Patient\//, ''),
  resolvePatientForDispense: vi.fn().mockResolvedValue({
    ref: 'pat-001',
    patient: null,
    allergies: [],
    allergyStatusUnknown: true,
    sources: { local: false, hub: false, cache: 'none' },
  }),
}))

const mockGetAccessToken = vi.fn().mockResolvedValue('test-token')
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
      selector({ session: { userId: 'u1', practitionerId: 'p1', role: 'PHARMACIST', sessionId: 's1' } }),
    ),
    {
      getState: vi.fn(() => ({
        session: { userId: 'u1', practitionerId: 'p1', role: 'PHARMACIST', sessionId: 's1' },
        getAccessToken: mockGetAccessToken,
      })),
    },
  ),
}))

vi.mock('@/lib/trpc', () => ({ getHubApiUrl: vi.fn(() => 'http://hub') }))
vi.mock('@/lib/prescription-status-client', () => ({ checkPrescriptionStatus: vi.fn() }))

import { verifyPrescriptionQr } from '@/lib/prescription-verify'
import { checkPrescriptionStatus } from '@/lib/prescription-status-client'
import { PharmacyScannerView } from '@/components/pharmacy/PharmacyScannerView'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import type { LocalMedicationDispense } from '@/lib/medication-dispense'
import type { SignedPrescriptionBundle } from '@ultranos/shared-types'

const mockVerifyQr = vi.mocked(verifyPrescriptionQr)
const mockCheckStatus = vi.mocked(checkPrescriptionStatus)

const RX = [{
  id: 'rx-001', med: 'AMX500', medN: 'Amoxicillin', medT: 'Amoxicillin 500mg Capsule',
  dos: { qty: 1, unit: 'capsule', freqN: 3, per: 1, perU: 'd' },
  dur: 7, req: 'pract-001', pat: 'pat-001', at: '2026-04-28T10:00:00Z',
}]

function b64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return btoa(s)
}

function makeQrData(): string {
  const bundle: SignedPrescriptionBundle = {
    payload: JSON.stringify(RX),
    sig: b64(new Uint8Array(64).fill(1)),
    pub: b64(new Uint8Array(32).fill(2)),
    issued_at: '2026-04-28T10:00:00Z',
    expiry: '2026-05-28T10:00:00Z',
  }
  return JSON.stringify(bundle)
}

function makeLocalDispense(prescriptionId: string): LocalMedicationDispense {
  return {
    id: crypto.randomUUID(),
    resourceType: 'MedicationDispense',
    status: 'completed',
    medicationCodeableConcept: { coding: [{ system: 'urn:ultranos:medication', code: 'AMX500', display: 'Amoxicillin' }], text: 'Amoxicillin 500mg Capsule' },
    subject: { reference: 'Patient/pat-001' },
    performer: [{ actor: { reference: 'Practitioner/p1' } }],
    authorizingPrescription: [{ reference: `MedicationRequest/${prescriptionId}` }],
    whenHandedOver: '2026-05-10T10:00:00Z',
    dosageInstruction: [{ text: '1 capsule' }],
    _ultranos: { hlcTimestamp: '000001714400000:00000:node-abc', createdAt: '2026-05-10T10:00:00Z', isOfflineCreated: true },
    meta: { lastUpdated: '2026-05-10T10:00:00Z', versionId: '1' },
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await db.delete()
  await db.open()
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  encryptionKeyStore.setKey(key)
  mockVerifyQr.mockResolvedValue({ status: 'verified', prescriptions: RX, practitionerName: 'Dr. Ahmad' })
})

afterEach(() => {
  encryptionKeyStore.wipe()
})

describe('Story 57.3 — offline local double-dispense guard (H-PHARM-2)', () => {
  it('BLOCKS a re-scan of a locally-dispensed prescription BEFORE the Hub check', async () => {
    await db.dispenses.put(makeLocalDispense('rx-001'))

    const onNavigate = vi.fn()
    const user = userEvent.setup()
    render(<PharmacyScannerView onNavigateToReview={onNavigate} />)

    fireEvent.change(screen.getByTestId('qr-paste-input'), { target: { value: makeQrData() } })
    await user.click(screen.getByTestId('verify-btn'))
    await waitFor(() => expect(screen.getByTestId('proceed-to-review-btn')).toBeInTheDocument())
    await user.click(screen.getByTestId('proceed-to-review-btn'))

    // Local guard fires first — blocking modal shown, no navigation, no load.
    await waitFor(() => expect(screen.getByTestId('local-duplicate-warning')).toBeInTheDocument())
    expect(onNavigate).not.toHaveBeenCalled()
    expect(mockLoadPrescriptions).not.toHaveBeenCalled()
    // The local check short-circuits BEFORE the Hub invalidation check runs.
    expect(mockCheckStatus).not.toHaveBeenCalled()
  })

  it('does NOT block when no local dispense exists (proceeds to Hub check)', async () => {
    mockCheckStatus.mockResolvedValue({
      prescriptionId: 'rx-001', status: 'AVAILABLE', medicationDisplay: 'Amoxicillin 500mg',
      authoredOn: '2026-04-28T10:00:00Z', dispensedAt: null,
    })

    const onNavigate = vi.fn()
    const user = userEvent.setup()
    render(<PharmacyScannerView onNavigateToReview={onNavigate} />)

    fireEvent.change(screen.getByTestId('qr-paste-input'), { target: { value: makeQrData() } })
    await user.click(screen.getByTestId('verify-btn'))
    await waitFor(() => expect(screen.getByTestId('proceed-to-review-btn')).toBeInTheDocument())
    await user.click(screen.getByTestId('proceed-to-review-btn'))

    await waitFor(() => expect(onNavigate).toHaveBeenCalled())
    expect(mockCheckStatus).toHaveBeenCalled()
    expect(screen.queryByTestId('local-duplicate-warning')).not.toBeInTheDocument()
  })

  it('supervisor override bypasses the local block and proceeds', async () => {
    mockCheckStatus.mockResolvedValue({
      prescriptionId: 'rx-001', status: 'AVAILABLE', medicationDisplay: 'Amoxicillin 500mg',
      authoredOn: '2026-04-28T10:00:00Z', dispensedAt: null,
    })
    await db.dispenses.put(makeLocalDispense('rx-001'))

    const onNavigate = vi.fn()
    const user = userEvent.setup()
    render(<PharmacyScannerView onNavigateToReview={onNavigate} />)

    fireEvent.change(screen.getByTestId('qr-paste-input'), { target: { value: makeQrData() } })
    await user.click(screen.getByTestId('verify-btn'))
    await waitFor(() => expect(screen.getByTestId('proceed-to-review-btn')).toBeInTheDocument())
    await user.click(screen.getByTestId('proceed-to-review-btn'))

    await waitFor(() => expect(screen.getByTestId('local-duplicate-warning')).toBeInTheDocument())

    // Open the override form.
    await user.click(screen.getByTestId('local-duplicate-override-btn'))
    // Confirm is disabled until supervisor + reason (≥10 chars) are provided.
    const confirm = screen.getByTestId('local-duplicate-override-confirm-btn')
    expect(confirm).toBeDisabled()

    fireEvent.change(screen.getByTestId('local-duplicate-supervisor'), { target: { value: 'Dr. Supervisor' } })
    fireEvent.change(screen.getByTestId('local-duplicate-reason'), { target: { value: 'Patient lost first fill; verified new need.' } })
    await waitFor(() => expect(confirm).toBeEnabled())

    await user.click(confirm)

    // Override → re-run with local check bypassed → Hub check → proceed.
    await waitFor(() => expect(onNavigate).toHaveBeenCalled())
    expect(mockCheckStatus).toHaveBeenCalled()
    expect(mockLoadPrescriptions).toHaveBeenCalledWith(RX, 'Dr. Ahmad')
  })
})
