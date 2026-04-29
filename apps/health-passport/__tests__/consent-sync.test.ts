import { ConsentScope, ConsentStatus, ConsentPurpose, GrantorRole } from '@ultranos/shared-types'
import type { FhirConsent } from '@ultranos/shared-types'

jest.mock('@/lib/audit', () => ({
  emitAuditEvent: jest.fn(),
}))

import {
  queueConsentSync,
  getPendingConsentSync,
  markConsentSynced,
  getConsentSyncLedger,
  _clearSyncQueue,
} from '@/lib/consent-sync'
import * as audit from '@/lib/audit'

const mockEmitAudit = jest.mocked(audit.emitAuditEvent)

const PATIENT_ID = 'patient-001'

function createMockConsent(id: string, status: ConsentStatus = ConsentStatus.ACTIVE): FhirConsent {
  return {
    id,
    resourceType: 'Consent',
    status,
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

describe('consent-sync', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    _clearSyncQueue()
  })

  describe('queueConsentSync', () => {
    it('queues a consent with priority 1 (highest)', () => {
      const consent = createMockConsent('c1')
      const entry = queueConsentSync(consent)

      expect(entry.priority).toBe(1)
      expect(entry.resourceType).toBe('Consent')
      expect(entry.synced).toBe(false)
      expect(entry.consent).toBe(consent)
    })

    it('emits an audit event when queuing', () => {
      const consent = createMockConsent('c2')
      queueConsentSync(consent)

      expect(mockEmitAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PHI_WRITE',
          resourceType: 'Consent',
          resourceId: 'c2',
          patientId: PATIENT_ID,
          outcome: 'success',
          metadata: expect.objectContaining({
            syncAction: 'queued',
            priority: '1',
          }),
        }),
      )
    })
  })

  describe('getPendingConsentSync', () => {
    it('returns only unsynced entries', () => {
      queueConsentSync(createMockConsent('c1'))
      queueConsentSync(createMockConsent('c2'))
      markConsentSynced('c1')

      const pending = getPendingConsentSync()
      expect(pending).toHaveLength(1)
      expect(pending[0].id).toBe('c2')
    })

    it('returns entries sorted by priority', () => {
      queueConsentSync(createMockConsent('c1'))
      queueConsentSync(createMockConsent('c2'))

      const pending = getPendingConsentSync()
      expect(pending).toHaveLength(2)
      // All consent entries have priority 1
      expect(pending[0].priority).toBe(1)
    })
  })

  describe('markConsentSynced', () => {
    it('marks entry as synced without removing from ledger', () => {
      queueConsentSync(createMockConsent('c1'))
      markConsentSynced('c1')

      const ledger = getConsentSyncLedger()
      expect(ledger).toHaveLength(1)
      expect(ledger[0].synced).toBe(true)
    })

    it('does nothing for unknown IDs', () => {
      queueConsentSync(createMockConsent('c1'))
      markConsentSynced('nonexistent')

      const ledger = getConsentSyncLedger()
      expect(ledger).toHaveLength(1)
      expect(ledger[0].synced).toBe(false)
    })
  })

  describe('getConsentSyncLedger (append-only)', () => {
    it('preserves all entries including synced ones', () => {
      queueConsentSync(createMockConsent('c1'))
      queueConsentSync(createMockConsent('c2'))
      markConsentSynced('c1')

      const ledger = getConsentSyncLedger()
      expect(ledger).toHaveLength(2)
    })

    it('maintains chronological order', () => {
      queueConsentSync(createMockConsent('c1'))
      queueConsentSync(createMockConsent('c2'))
      queueConsentSync(createMockConsent('c3'))

      const ledger = getConsentSyncLedger()
      expect(ledger[0].id).toBe('c1')
      expect(ledger[1].id).toBe('c2')
      expect(ledger[2].id).toBe('c3')
    })
  })
})
