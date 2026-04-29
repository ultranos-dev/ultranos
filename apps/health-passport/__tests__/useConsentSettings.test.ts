import { renderHook, act, waitFor } from '@testing-library/react-native'
import { ConsentScope, ConsentStatus, ConsentPurpose, GrantorRole } from '@ultranos/shared-types'
import type { FhirConsent } from '@ultranos/shared-types'

jest.mock('@/lib/offline-store', () => ({
  loadConsents: jest.fn(),
  saveConsents: jest.fn(),
}))

jest.mock('@/lib/audit', () => ({
  emitAuditEvent: jest.fn(),
}))

jest.mock('@ultranos/sync-engine', () => ({
  HybridLogicalClock: jest.fn().mockImplementation(() => ({
    now: () => ({ wallMs: 1714400000000, counter: 1, nodeId: 'test-node' }),
  })),
  serializeHlc: jest.fn().mockReturnValue('000001714400000:00001:test-node'),
}))

import { useConsentSettings } from '@/hooks/useConsentSettings'
import * as offlineStore from '@/lib/offline-store'
import * as audit from '@/lib/audit'

const mockLoadConsents = jest.mocked(offlineStore.loadConsents)
const mockSaveConsents = jest.mocked(offlineStore.saveConsents)
const mockEmitAudit = jest.mocked(audit.emitAuditEvent)

const PATIENT_ID = 'patient-001'

const MOCK_ACTIVE_CONSENT: FhirConsent = {
  id: 'consent-1',
  resourceType: 'Consent',
  status: ConsentStatus.ACTIVE,
  scope: {
    coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy' }],
  },
  category: [ConsentScope.PRESCRIPTIONS],
  patient: { reference: `Patient/${PATIENT_ID}` },
  dateTime: '2026-04-28T10:00:00.000Z',
  provision: { period: { start: '2026-04-28T10:00:00.000Z' } },
  _ultranos: {
    grantorId: PATIENT_ID,
    grantorRole: GrantorRole.SELF,
    purpose: ConsentPurpose.TREATMENT,
    validFrom: '2026-04-28T10:00:00.000Z',
    consentVersion: '1.0',
    auditHash: '0'.repeat(64),
    createdAt: '2026-04-28T10:00:00.000Z',
  },
  meta: { lastUpdated: '2026-04-28T10:00:00.000Z' },
}

describe('useConsentSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLoadConsents.mockResolvedValue([])
    mockSaveConsents.mockResolvedValue(undefined)
  })

  it('loads consent settings on mount', async () => {
    mockLoadConsents.mockResolvedValue([MOCK_ACTIVE_CONSENT])

    const { result } = renderHook(() => useConsentSettings(PATIENT_ID))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockLoadConsents).toHaveBeenCalledWith(PATIENT_ID)
    expect(result.current.categories).toHaveLength(5) // All DATA_CATEGORIES
    const prescriptions = result.current.categories.find((c) => c.scope === ConsentScope.PRESCRIPTIONS)
    expect(prescriptions?.enabled).toBe(true)
    expect(prescriptions?.lastUpdated).toBe('2026-04-28T10:00:00.000Z')
  })

  it('defaults all categories to disabled when no consents exist', async () => {
    const { result } = renderHook(() => useConsentSettings(PATIENT_ID))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    for (const cat of result.current.categories) {
      expect(cat.enabled).toBe(false)
      expect(cat.lastUpdated).toBeNull()
    }
  })

  it('emits audit event on load', async () => {
    mockLoadConsents.mockResolvedValue([])

    const { result } = renderHook(() => useConsentSettings(PATIENT_ID))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockEmitAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_READ',
        resourceType: 'Consent',
        patientId: PATIENT_ID,
        outcome: 'success',
      }),
    )
  })

  it('toggles consent from disabled to enabled', async () => {
    const { result } = renderHook(() => useConsentSettings(PATIENT_ID))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.toggleConsent(ConsentScope.PRESCRIPTIONS)
    })

    const prescriptions = result.current.categories.find((c) => c.scope === ConsentScope.PRESCRIPTIONS)
    expect(prescriptions?.enabled).toBe(true)
    expect(mockSaveConsents).toHaveBeenCalledWith(
      PATIENT_ID,
      expect.arrayContaining([
        expect.objectContaining({
          status: ConsentStatus.ACTIVE,
          category: [ConsentScope.PRESCRIPTIONS],
        }),
      ]),
    )
  })

  it('toggles consent from enabled to withdrawn', async () => {
    mockLoadConsents.mockResolvedValue([MOCK_ACTIVE_CONSENT])

    const { result } = renderHook(() => useConsentSettings(PATIENT_ID))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.toggleConsent(ConsentScope.PRESCRIPTIONS)
    })

    const prescriptions = result.current.categories.find((c) => c.scope === ConsentScope.PRESCRIPTIONS)
    expect(prescriptions?.enabled).toBe(false)
    expect(mockSaveConsents).toHaveBeenCalledWith(
      PATIENT_ID,
      expect.arrayContaining([
        expect.objectContaining({
          status: ConsentStatus.WITHDRAWN,
          category: [ConsentScope.PRESCRIPTIONS],
        }),
      ]),
    )
  })

  it('emits audit event on toggle', async () => {
    const { result } = renderHook(() => useConsentSettings(PATIENT_ID))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    mockEmitAudit.mockClear()

    await act(async () => {
      await result.current.toggleConsent(ConsentScope.LABS)
    })

    expect(mockEmitAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_WRITE',
        resourceType: 'Consent',
        patientId: PATIENT_ID,
        outcome: 'success',
        metadata: expect.objectContaining({
          scope: ConsentScope.LABS,
          action: 'grant',
        }),
      }),
    )
  })

  it('returns sorted consent history (newest first)', async () => {
    const olderConsent: FhirConsent = {
      ...MOCK_ACTIVE_CONSENT,
      id: 'consent-0',
      dateTime: '2026-04-27T09:00:00.000Z',
    }
    mockLoadConsents.mockResolvedValue([olderConsent, MOCK_ACTIVE_CONSENT])

    const { result } = renderHook(() => useConsentSettings(PATIENT_ID))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.consentHistory[0].id).toBe('consent-1')
    expect(result.current.consentHistory[1].id).toBe('consent-0')
  })

  it('handles load failure with sanitized error', async () => {
    mockLoadConsents.mockRejectedValue(new Error('storage corruption'))

    const { result } = renderHook(() => useConsentSettings(PATIENT_ID))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Failed to load privacy settings')
    expect(mockEmitAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_READ',
        outcome: 'failure',
      }),
    )
  })

  it('does nothing when patientId is undefined', async () => {
    const { result } = renderHook(() => useConsentSettings(undefined))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.categories).toHaveLength(5)
    expect(mockLoadConsents).not.toHaveBeenCalled()
  })
})
