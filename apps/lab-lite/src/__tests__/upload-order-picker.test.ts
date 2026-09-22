/**
 * Tests for the upload wizard reducer additions:
 * - SET_ORDER action
 * - SET_PATIENT clears orderId
 * - GO_TO_STEP VERIFY_PATIENT leaves orderId null
 *
 * The reducer is exported from the page module for testability.
 */
import { describe, it, expect, vi } from 'vitest'

// Mock all heavy Next.js / Supabase / next-intl deps the page imports so the
// module can be loaded in a pure Node test environment without a browser.
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
  }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('@/lib/trpc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/trpc')>()
  return { ...actual, analyzeUpload: vi.fn(), verifyPatient: vi.fn() }
})
vi.mock('@/lib/audit-client', () => ({ reportQueueAuditEvent: vi.fn() }))
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: { session: null }) => unknown) => selector({ session: null }),
}))
vi.mock('@/hooks/useRecentPatients', () => ({ useRecentPatients: () => [] }))
vi.mock('@/components/PatientVerifyForm', () => ({ PatientVerifyForm: () => null }))
vi.mock('@/components/PatientVerifyScanner', () => ({ PatientVerifyScanner: () => null }))
vi.mock('@/components/upload/RecentPatientsList', () => ({ RecentPatientsList: () => null }))
vi.mock('@/components/upload/PatientSearchInput', () => ({ PatientSearchInput: () => null }))
vi.mock('@/components/ResultUpload', () => ({ ResultUpload: () => null }))
vi.mock('@/components/MetadataForm', () => ({ MetadataForm: () => null }))
vi.mock('@/components/upload/ReviewStep', () => ({ ReviewStep: () => null }))
vi.mock('@/components/upload/StepIndicator', () => ({
  StepIndicator: () => null,
}))
vi.mock('@/components/upload/OrderPickerStep', () => ({
  OrderPickerStep: () => null,
}))
vi.mock('@/components/ui/Button', () => ({
  Button: ({ children }: { children: unknown }) => children,
}))
vi.mock('@/lib/db', () => ({ addToQueue: vi.fn() }))
vi.mock('html5-qrcode', () => ({
  Html5Qrcode: vi.fn().mockImplementation(() => ({ start: vi.fn(), stop: vi.fn(), clear: vi.fn() })),
}))

import { wizardReducer, initialState } from '../app/[locale]/(app)/upload/wizard'

describe('Upload wizard reducer — order picker', () => {
  it('initial step is SELECT_ORDER', () => {
    expect(initialState.step).toBe('SELECT_ORDER')
  })

  it('initial orderId is null', () => {
    expect(initialState.orderId).toBeNull()
  })

  it('SET_ORDER sets patient + orderId and jumps to UPLOAD_FILE', () => {
    const patient = { patientRef: 'Patient/abc', patientFirstName: 'Ahmad', patientAge: 34 }
    const next = wizardReducer(initialState, {
      type: 'SET_ORDER',
      payload: { patient, orderId: 'order-999' },
    })
    expect(next.step).toBe('UPLOAD_FILE')
    expect(next.orderId).toBe('order-999')
    expect(next.patient).toEqual(patient)
    // Resets file/ocr/metadata
    expect(next.file).toBeNull()
    expect(next.ocrResult).toBeNull()
    expect(next.ocrLoading).toBe(false)
    expect(next.metadata).toBeNull()
  })

  it('SET_ORDER resets file/ocr when called from a later step', () => {
    const withFile: typeof initialState = {
      ...initialState,
      step: 'UPLOAD_FILE',
      patient: { patientRef: 'p1', patientFirstName: 'Ali', patientAge: 20 },
      orderId: 'old-order',
      file: { file: new File([], 'x.pdf'), fileName: 'x.pdf', fileType: 'application/pdf' },
    }
    const next = wizardReducer(withFile, {
      type: 'SET_ORDER',
      payload: { patient: { patientRef: 'p2', patientFirstName: 'Omar', patientAge: 25 }, orderId: 'new-order' },
    })
    expect(next.orderId).toBe('new-order')
    expect(next.file).toBeNull()
  })

  it('SET_PATIENT sets orderId to null (free-form path)', () => {
    const withOrder: typeof initialState = {
      ...initialState,
      step: 'UPLOAD_FILE',
      orderId: 'order-xyz',
      patient: { patientRef: 'p1', patientFirstName: 'Ali', patientAge: 20 },
    }
    const next = wizardReducer(withOrder, {
      type: 'SET_PATIENT',
      payload: { patientRef: 'p2', patientFirstName: 'Sara', patientAge: 30 },
    })
    expect(next.orderId).toBeNull()
    expect(next.step).toBe('UPLOAD_FILE')
    expect(next.patient?.patientFirstName).toBe('Sara')
  })

  it('GO_TO_STEP VERIFY_PATIENT leaves orderId null when it was already null', () => {
    const next = wizardReducer(initialState, {
      type: 'GO_TO_STEP',
      payload: 'VERIFY_PATIENT',
    })
    expect(next.orderId).toBeNull()
    expect(next.step).toBe('VERIFY_PATIENT')
  })

  it('GO_TO_STEP VERIFY_PATIENT does NOT clear a set orderId (GO_TO_STEP is a plain step jump)', () => {
    // GO_TO_STEP only changes step — the skip path in the page calls it before
    // any order is set, so orderId is always null at that point. This test
    // documents that GO_TO_STEP itself does not mutate orderId.
    const withOrder: typeof initialState = {
      ...initialState,
      orderId: 'order-abc',
      step: 'UPLOAD_FILE',
    }
    const next = wizardReducer(withOrder, {
      type: 'GO_TO_STEP',
      payload: 'VERIFY_PATIENT',
    })
    // GO_TO_STEP is a plain step jump — orderId unchanged
    expect(next.orderId).toBe('order-abc')
    expect(next.step).toBe('VERIFY_PATIENT')
  })
})
