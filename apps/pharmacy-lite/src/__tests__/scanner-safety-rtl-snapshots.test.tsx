/**
 * Story 63.1 (AC 1, AC 6) — LTR + RTL snapshot coverage for the safety-critical
 * pharmacy scanner warning states now that their strings are keyed:
 *   - Fraud Warning (invalid_signature)
 *   - Prescriber Key Revoked (key_revoked)
 *   - Already Dispensed Elsewhere (global fulfillment block)
 *
 * These states must render their translated strings correctly under both
 * `dir="ltr"` (English) and `dir="rtl"` (Arabic), with no layout break from the
 * longer RTL translations. The snapshots capture the actual translated text (not
 * raw keys), so a regression that drops a key or an RTL translation is caught.
 */

import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import enMessages from '../../messages/en.json'
import arMessages from '../../messages/ar.json'

// Resolve a namespaced key against a real messages object, interpolating ICU
// {param} placeholders — mirrors what NextIntlClientProvider would render.
type Msgs = Record<string, Record<string, string>>
let activeMessages: Msgs = enMessages as unknown as Msgs

function makeTranslator(ns: string) {
  return (key: string, values?: Record<string, unknown>) => {
    let str = activeMessages[ns]?.[key] ?? `${ns}.${key}`
    if (values) {
      for (const [k, v] of Object.entries(values)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return str
  }
}

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => makeTranslator(ns),
  useLocale: () => 'en',
  NextIntlClientProvider: ({ children }: { children: unknown }) => children,
}))

// Store / lib mocks — the scanner view imports these at module load.
const mockLoadPrescriptions = vi.fn()
const mockSetResolvedPatient = vi.fn()
vi.mock('@/stores/fulfillment-store', () => ({
  useFulfillmentStore: Object.assign(
    vi.fn(() => ({ loadPrescriptions: mockLoadPrescriptions, setResolvedPatient: mockSetResolvedPatient })),
    { getState: vi.fn(() => ({ loadPrescriptions: mockLoadPrescriptions, setResolvedPatient: mockSetResolvedPatient })) },
  ),
}))
vi.mock('@/stores/patient-store', () => ({
  usePatientStore: Object.assign(vi.fn(() => ({})), {
    getState: vi.fn(() => ({ activePatient: null, clearPatient: vi.fn() })),
  }),
}))
// Authenticated with a token so the global-status check runs (not the offline
// branch). getAccessToken resolves a token; session is a pharmacist.
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
      selector({ session: { role: 'PHARMACIST' } }),
    ),
    {
      getState: vi.fn(() => ({
        session: { role: 'PHARMACIST' },
        getAccessToken: vi.fn().mockResolvedValue('tok'),
      })),
    },
  ),
}))
vi.mock('@/lib/trpc', () => ({ getHubApiUrl: vi.fn(() => 'http://hub') }))
vi.mock('@/lib/prescription-verify', () => ({
  verifyPrescriptionQr: vi.fn(),
  fetchAndCachePractitionerKey: vi.fn(),
}))
vi.mock('@/lib/prescription-status-client', () => ({ checkPrescriptionStatus: vi.fn() }))
vi.mock('@/lib/patient-resolution', () => ({
  normalizePatientRef: (r: string) => r,
  resolvePatientForDispense: vi.fn(),
}))
vi.mock('@/lib/idempotency-check', () => ({ checkPrescriptionAlreadyDispensed: vi.fn() }))

// The two exported warning renderers live inside PharmacyScannerView. They are
// module-private, so we drive them through the public component by simulating a
// verification result. Import after mocks.
import { PharmacyScannerView } from '@/components/pharmacy/PharmacyScannerView'
import { verifyPrescriptionQr } from '@/lib/prescription-verify'
import { fireEvent, waitFor, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockVerifyQr = vi.mocked(verifyPrescriptionQr)

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  document.dir = 'ltr'
  activeMessages = enMessages as unknown as Msgs
})

async function renderResultState(status: 'invalid_signature' | 'key_revoked') {
  mockVerifyQr.mockResolvedValue({ status } as never)
  const user = userEvent.setup()
  const view = render(<PharmacyScannerView />)
  fireEvent.change(screen.getByTestId('qr-paste-input'), { target: { value: '{"payload":"x"}' } })
  await user.click(screen.getByTestId('verify-btn'))
  return view
}

describe('Scanner safety warnings — Fraud Warning (LTR/RTL)', () => {
  it('renders fraud warning in LTR (en)', async () => {
    document.dir = 'ltr'
    activeMessages = enMessages as unknown as Msgs
    const { container } = await renderResultState('invalid_signature')
    await waitFor(() => expect(screen.getByTestId('fraud-warning')).toBeInTheDocument())
    expect(screen.getByText('⚠ Fraud Warning')).toBeInTheDocument()
    expect(container.querySelector('[data-testid="fraud-warning"]')).toMatchSnapshot()
  })

  it('renders fraud warning in RTL (ar)', async () => {
    document.dir = 'rtl'
    activeMessages = arMessages as unknown as Msgs
    const { container } = await renderResultState('invalid_signature')
    await waitFor(() => expect(screen.getByTestId('fraud-warning')).toBeInTheDocument())
    // Real Arabic translation is rendered, not the raw key.
    expect(screen.getByText(arMessages.prescription.fraudWarningHeading)).toBeInTheDocument()
    expect(container.querySelector('[data-testid="fraud-warning"]')).toMatchSnapshot()
  })
})

describe('Scanner safety warnings — Prescriber Key Revoked (LTR/RTL)', () => {
  it('renders key-revoked warning in LTR (en)', async () => {
    document.dir = 'ltr'
    activeMessages = enMessages as unknown as Msgs
    const { container } = await renderResultState('key_revoked')
    await waitFor(() => expect(screen.getByTestId('key-revoked-warning')).toBeInTheDocument())
    expect(screen.getByText('Prescriber Key Revoked')).toBeInTheDocument()
    expect(container.querySelector('[data-testid="key-revoked-warning"]')).toMatchSnapshot()
  })

  it('renders key-revoked warning in RTL (ar)', async () => {
    document.dir = 'rtl'
    activeMessages = arMessages as unknown as Msgs
    const { container } = await renderResultState('key_revoked')
    await waitFor(() => expect(screen.getByTestId('key-revoked-warning')).toBeInTheDocument())
    expect(screen.getByText(arMessages.prescription.keyRevoked)).toBeInTheDocument()
    expect(container.querySelector('[data-testid="key-revoked-warning"]')).toMatchSnapshot()
  })
})

describe('Scanner safety warnings — Already Dispensed Elsewhere (LTR/RTL)', () => {
  async function renderBlockedState() {
    // Verified prescription, then the global status check reports FULFILLED.
    mockVerifyQr.mockResolvedValue({
      status: 'verified',
      prescriptions: [{ id: 'rx-1', medN: 'Amoxicillin', dos: { qty: 1, unit: 'cap' }, dur: 7, pat: 'Patient/p1' }],
      practitionerName: 'Dr. A',
    } as never)
    const { checkPrescriptionAlreadyDispensed } = await import('@/lib/idempotency-check')
    vi.mocked(checkPrescriptionAlreadyDispensed).mockResolvedValue({ alreadyDispensed: false } as never)
    const { checkPrescriptionStatus } = await import('@/lib/prescription-status-client')
    vi.mocked(checkPrescriptionStatus).mockResolvedValue({
      prescriptionId: 'rx-1',
      status: 'FULFILLED',
      dispensedAt: '2026-05-01T09:00:00Z',
    } as never)

    const user = userEvent.setup()
    const view = render(<PharmacyScannerView />)
    fireEvent.change(screen.getByTestId('qr-paste-input'), { target: { value: '{"payload":"x","sig":"s","pub":"p"}' } })
    await user.click(screen.getByTestId('verify-btn'))
    await waitFor(() => expect(screen.getByTestId('proceed-to-review-btn')).toBeInTheDocument())
    await user.click(screen.getByTestId('proceed-to-review-btn'))
    return view
  }

  it('renders already-dispensed block in LTR (en)', async () => {
    document.dir = 'ltr'
    activeMessages = enMessages as unknown as Msgs
    const { container } = await renderBlockedState()
    await waitFor(() => expect(screen.getByTestId('already-dispensed-warning')).toBeInTheDocument())
    expect(screen.getByText('Already Dispensed Elsewhere')).toBeInTheDocument()
    expect(container.querySelector('[data-testid="already-dispensed-warning"]')).toMatchSnapshot()
  })

  it('renders already-dispensed block in RTL (ar)', async () => {
    document.dir = 'rtl'
    activeMessages = arMessages as unknown as Msgs
    const { container } = await renderBlockedState()
    await waitFor(() => expect(screen.getByTestId('already-dispensed-warning')).toBeInTheDocument())
    expect(screen.getByText(arMessages.prescription.alreadyDispensedElsewhere)).toBeInTheDocument()
    expect(container.querySelector('[data-testid="already-dispensed-warning"]')).toMatchSnapshot()
  })
})
