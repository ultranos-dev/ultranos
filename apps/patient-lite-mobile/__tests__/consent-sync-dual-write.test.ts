/**
 * Tests that consent sync triggers BOTH ledger append AND sync-engine enqueue.
 */
import { ConsentScope, ConsentStatus, ConsentPurpose, GrantorRole } from '@ultranos/shared-types'
import type { FhirConsent } from '@ultranos/shared-types'

jest.mock('@/lib/audit', () => ({
  emitAuditEvent: jest.fn(),
}))

const mockEnqueue = jest.fn().mockResolvedValue(undefined)
jest.mock('@ultranos/sync-engine', () => ({
  getSyncPriority: jest.fn().mockReturnValue(1),
  enqueueSyncAction: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/consent-queue-adapter', () => ({
  consentToEnqueueInput: jest.fn().mockReturnValue({
    resourceType: 'Consent',
    resourceId: 'c1',
    action: 'create',
    payload: { id: 'c1', resourceType: 'Consent' },
    hlcTimestamp: '000000000000001:00000:test-node',
  }),
}))

import {
  queueConsentSync,
  getConsentSyncLedger,
  setSyncEngineQueue,
  _clearSyncQueue,
} from '@/lib/consent-sync'
import { enqueueSyncAction } from '@ultranos/sync-engine'
import { consentToEnqueueInput } from '@/lib/consent-queue-adapter'

const PATIENT_ID = 'patient-001'

function createMockConsent(id: string): FhirConsent {
  return {
    id,
    resourceType: 'Consent',
    status: ConsentStatus.ACTIVE,
    scope: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy' }],
    },
    category: [ConsentScope.PRESCRIPTIONS],
    patient: { reference: `Patient/${PATIENT_ID}` },
    dateTime: new Date().toISOString(),
    provision: { period: { start: new Date().toISOString() } },
    _ultranos: {
      grantorId: PATIENT_ID,
      grantorRole: GrantorRole.SELF,
      purpose: ConsentPurpose.TREATMENT,
      validFrom: new Date().toISOString(),
      consentVersion: '1.0',
      auditHash: '0'.repeat(64),
      createdAt: new Date().toISOString(),
    },
    meta: { lastUpdated: new Date().toISOString() },
  }
}

describe('consent-sync dual-write', () => {
  const mockQueue = {
    enqueue: mockEnqueue,
    getPending: jest.fn(),
    markSyncing: jest.fn(),
    markSynced: jest.fn(),
    markFailed: jest.fn(),
    recoverStale: jest.fn(),
    getCounts: jest.fn(),
    getLastSyncedAt: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    _clearSyncQueue()
    setSyncEngineQueue(null)
  })

  it('writes to both ledger and sync-engine queue when queue is set', async () => {
    setSyncEngineQueue(mockQueue as any)
    const consent = createMockConsent('c1')

    await queueConsentSync(consent)

    // Ledger still has the entry
    const ledger = getConsentSyncLedger()
    expect(ledger).toHaveLength(1)
    expect(ledger[0].id).toBe('c1')

    // Sync-engine enqueue was also called
    expect(consentToEnqueueInput).toHaveBeenCalledWith(consent)
    expect(enqueueSyncAction).toHaveBeenCalledWith(
      mockQueue,
      expect.objectContaining({ resourceType: 'Consent', resourceId: 'c1' }),
    )
  })

  it('only writes to ledger when sync-engine queue is not set', async () => {
    // syncEngineQueue is null (not yet initialized)
    const consent = createMockConsent('c2')

    await queueConsentSync(consent)

    // Ledger has the entry
    const ledger = getConsentSyncLedger()
    expect(ledger).toHaveLength(1)

    // Sync-engine enqueue was NOT called
    expect(enqueueSyncAction).not.toHaveBeenCalled()
  })

  it('ledger is written before sync-engine enqueue is called', async () => {
    const mockEnqueueAction = jest.mocked(enqueueSyncAction)
    let ledgerLengthAtEnqueueTime = 0

    mockEnqueueAction.mockImplementationOnce(async () => {
      // Check that ledger was already written by the time enqueue is called
      ledgerLengthAtEnqueueTime = getConsentSyncLedger().length
    })

    setSyncEngineQueue(mockQueue as any)
    const consent = createMockConsent('c3')

    await queueConsentSync(consent)

    // Ledger entry existed before enqueue was called
    expect(ledgerLengthAtEnqueueTime).toBe(1)
    // And still exists after
    const ledger = getConsentSyncLedger()
    expect(ledger).toHaveLength(1)
    expect(ledger[0].id).toBe('c3')
  })
})
