/**
 * Send-Out Service Tests — Story 54.4 / Task 14.1
 *
 * Covers: create send-out, status transitions (valid + invalid), result import with attribution.
 * Audit event emission is verified for every mutating operation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

vi.mock('../lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/db')>()
  return {
    ...actual,
    getDb: vi.fn(),
    createSendOut: vi.fn(),
    addSendOutTransition: vi.fn(),
  }
})

vi.mock('../lib/audit-client', () => ({
  reportSendOutAuditEvent: vi.fn(),
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test' }) },
  serializeHlc: vi.fn().mockReturnValue('mock-hlc'),
}))

vi.mock('uuid', () => ({ v4: vi.fn().mockReturnValue('mock-uuid') }))

import {
  initiateSendOut,
  updateSendOutStatus,
  importSendOutResult,
  generateReferralForm,
  generateShippingManifest,
} from '../lib/sendout-service'
import { getDb, createSendOut, addSendOutTransition } from '../lib/db'
import { reportSendOutAuditEvent } from '../lib/audit-client'
import type { SendOut, ReferenceLab } from '../types/reference-lab'

const mockCreateSendOut = vi.mocked(createSendOut)
const mockAddSendOutTransition = vi.mocked(addSendOutTransition)
const mockReportSendOutAuditEvent = vi.mocked(reportSendOutAuditEvent)
const mockGetDb = vi.mocked(getDb)

function makeMockDb(overrides: Record<string, unknown> = {}) {
  return {
    send_outs: {
      get: vi.fn(),
      put: vi.fn(),
    },
    reference_labs: {
      get: vi.fn(),
    },
    lab_results: {
      put: vi.fn(),
    },
    ...overrides,
  } as unknown as ReturnType<typeof getDb>
}

function makeSendOut(overrides: Partial<SendOut> = {}): SendOut {
  const now = new Date().toISOString()
  return {
    id: 'so-001',
    sampleId: 'sample-001',
    referenceLabId: 'lab-001',
    testRequested: { loincCode: '2085-9', loincDisplay: 'Cholesterol' },
    clinicalContext: 'suspected hyperlipidemia',
    status: 'sent',
    sentAt: 'mock-hlc',
    receivedAt: null,
    processingStartedAt: null,
    resultsAvailableAt: null,
    cancelledAt: null,
    shippingManifestId: 'manifest-001',
    referralFormId: 'referral-001',
    resultId: null,
    meta: { lastUpdated: now, versionId: '1' },
    _ultranos: { createdAt: now, hlcTimestamp: 'mock-hlc' },
    ...overrides,
  }
}

function makeReferenceLab(overrides: Partial<ReferenceLab> = {}): ReferenceLab {
  const now = new Date().toISOString()
  return {
    id: 'lab-001',
    name: 'Kabul Reference Lab',
    accreditationNumber: 'AFG-LAB-001',
    address: 'Kabul, Afghanistan',
    supportedTests: ['2085-9', '4548-4'],
    averageTATDays: { '2085-9': 5 },
    isActive: true,
    meta: { lastUpdated: now, versionId: '1' },
    _ultranos: { createdAt: now, hlcTimestamp: 'mock-hlc' },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('initiateSendOut', () => {
  it('creates a send-out with status sent', async () => {
    mockCreateSendOut.mockResolvedValue(undefined)

    const result = await initiateSendOut(
      {
        sampleId: 'sample-001',
        referenceLabId: 'lab-001',
        testRequested: { loincCode: '2085-9', loincDisplay: 'Cholesterol' },
        clinicalContext: 'suspected hyperlipidemia',
      },
      'user-001',
    )

    expect(result.status).toBe('sent')
    expect(result.sampleId).toBe('sample-001')
    expect(result.referenceLabId).toBe('lab-001')
    expect(result.resultId).toBeNull()
    expect(mockCreateSendOut).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }))
  })

  it('emits SENDOUT_CREATED audit event', async () => {
    mockCreateSendOut.mockResolvedValue(undefined)

    await initiateSendOut(
      {
        sampleId: 'sample-001',
        referenceLabId: 'lab-001',
        testRequested: { loincCode: '2085-9', loincDisplay: 'Cholesterol' },
        clinicalContext: 'context',
      },
      'actor-001',
    )

    expect(mockReportSendOutAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SENDOUT_CREATED',
        actorId: 'actor-001',
        referenceLabId: 'lab-001',
      }),
    )
  })
})

describe('updateSendOutStatus — valid transitions', () => {
  it('advances sent → received', async () => {
    const db = makeMockDb()
    const sendOut = makeSendOut({ status: 'sent' })
    ;(db.send_outs.get as ReturnType<typeof vi.fn>).mockResolvedValue(sendOut)
    ;(db.send_outs.put as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    mockGetDb.mockReturnValue(db)
    mockAddSendOutTransition.mockResolvedValue(undefined)

    const updated = await updateSendOutStatus('so-001', 'received', 'manual', 'actor-001')

    expect(updated.status).toBe('received')
    expect(updated.receivedAt).toBe('mock-hlc')
    expect(mockAddSendOutTransition).toHaveBeenCalledWith(
      expect.objectContaining({ fromStatus: 'sent', toStatus: 'received', source: 'manual' }),
    )
    expect(mockReportSendOutAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SENDOUT_STATUS_UPDATED' }),
    )
  })

  it('advances received → processing', async () => {
    const db = makeMockDb()
    const sendOut = makeSendOut({ status: 'received', receivedAt: 'mock-hlc' })
    ;(db.send_outs.get as ReturnType<typeof vi.fn>).mockResolvedValue(sendOut)
    ;(db.send_outs.put as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    mockGetDb.mockReturnValue(db)
    mockAddSendOutTransition.mockResolvedValue(undefined)

    const updated = await updateSendOutStatus('so-001', 'processing', 'manual', 'actor-001')

    expect(updated.status).toBe('processing')
    expect(updated.processingStartedAt).toBe('mock-hlc')
  })

  it('advances processing → results-available', async () => {
    const db = makeMockDb()
    const sendOut = makeSendOut({ status: 'processing' })
    ;(db.send_outs.get as ReturnType<typeof vi.fn>).mockResolvedValue(sendOut)
    ;(db.send_outs.put as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    mockGetDb.mockReturnValue(db)
    mockAddSendOutTransition.mockResolvedValue(undefined)

    const updated = await updateSendOutStatus('so-001', 'results-available', 'import', 'actor-001')

    expect(updated.status).toBe('results-available')
    expect(updated.resultsAvailableAt).toBe('mock-hlc')
  })

  it('cancels from any status', async () => {
    for (const status of ['sent', 'received', 'processing'] as const) {
      vi.clearAllMocks()
      const db = makeMockDb()
      const sendOut = makeSendOut({ status })
      ;(db.send_outs.get as ReturnType<typeof vi.fn>).mockResolvedValue(sendOut)
      ;(db.send_outs.put as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
      mockGetDb.mockReturnValue(db)
      mockAddSendOutTransition.mockResolvedValue(undefined)

      const updated = await updateSendOutStatus('so-001', 'cancelled', 'manual', 'actor-001')
      expect(updated.status).toBe('cancelled')
    }
  })
})

describe('updateSendOutStatus — invalid transitions', () => {
  it('rejects backward transition received → sent', async () => {
    const db = makeMockDb()
    const sendOut = makeSendOut({ status: 'received' })
    ;(db.send_outs.get as ReturnType<typeof vi.fn>).mockResolvedValue(sendOut)
    mockGetDb.mockReturnValue(db)

    await expect(
      updateSendOutStatus('so-001', 'sent', 'manual', 'actor-001'),
    ).rejects.toThrow(/invalid status transition/i)
  })

  it('rejects skipping a step: sent → processing', async () => {
    const db = makeMockDb()
    const sendOut = makeSendOut({ status: 'sent' })
    ;(db.send_outs.get as ReturnType<typeof vi.fn>).mockResolvedValue(sendOut)
    mockGetDb.mockReturnValue(db)

    await expect(
      updateSendOutStatus('so-001', 'processing', 'manual', 'actor-001'),
    ).rejects.toThrow(/invalid status transition/i)
  })

  it('rejects transition from cancelled', async () => {
    const db = makeMockDb()
    const sendOut = makeSendOut({ status: 'cancelled' })
    ;(db.send_outs.get as ReturnType<typeof vi.fn>).mockResolvedValue(sendOut)
    mockGetDb.mockReturnValue(db)

    await expect(
      updateSendOutStatus('so-001', 'received', 'manual', 'actor-001'),
    ).rejects.toThrow(/invalid status transition/i)
  })

  it('throws when send-out not found', async () => {
    const db = makeMockDb()
    ;(db.send_outs.get as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    mockGetDb.mockReturnValue(db)

    await expect(
      updateSendOutStatus('missing-id', 'received', 'manual', 'actor-001'),
    ).rejects.toThrow(/not found/i)
  })
})

describe('importSendOutResult', () => {
  it('applies attribution from reference lab', async () => {
    const db = makeMockDb()
    const sendOut = makeSendOut({ status: 'processing' })
    const lab = makeReferenceLab()
    ;(db.send_outs.get as ReturnType<typeof vi.fn>).mockResolvedValue(sendOut)
    ;(db.reference_labs.get as ReturnType<typeof vi.fn>).mockResolvedValue(lab)
    ;(db.send_outs.put as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    ;(db.lab_results.put as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    mockGetDb.mockReturnValue(db)
    mockAddSendOutTransition.mockResolvedValue(undefined)

    await importSendOutResult('so-001', { value: '5.2', unit: 'mmol/L' }, 'actor-001')

    const putCall = (db.lab_results.put as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(putCall).toBeDefined()
    expect(putCall.attribution).toContain('Kabul Reference Lab')
    expect(putCall.attribution).toContain('AFG-LAB-001')
  })

  it('emits SENDOUT_RESULT_IMPORTED audit event', async () => {
    const db = makeMockDb()
    const sendOut = makeSendOut({ status: 'processing' })
    const lab = makeReferenceLab()
    ;(db.send_outs.get as ReturnType<typeof vi.fn>).mockResolvedValue(sendOut)
    ;(db.reference_labs.get as ReturnType<typeof vi.fn>).mockResolvedValue(lab)
    ;(db.send_outs.put as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    ;(db.lab_results.put as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    mockGetDb.mockReturnValue(db)
    mockAddSendOutTransition.mockResolvedValue(undefined)

    await importSendOutResult('so-001', { value: '5.2' }, 'actor-001')

    expect(mockReportSendOutAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SENDOUT_RESULT_IMPORTED', actorId: 'actor-001' }),
    )
  })
})

describe('generateReferralForm — data minimization (AC #2, CLAUDE.md Rule #7)', () => {
  it('includes only first name + age — no other PHI', () => {
    const sendOut = makeSendOut()
    const lab = makeReferenceLab()
    const mockSample = {
      id: 'sample-001',
      resourceType: 'Specimen',
      subject: { reference: 'Patient/patient-001' },
      type: { coding: [{ display: 'Blood' }] },
      _ultranos: {},
    } as any

    const form = generateReferralForm(sendOut, mockSample, lab, 'Fatima', 32, 'District Lab')

    expect(form.patientFirstName).toBe('Fatima')
    expect(form.patientAge).toBe(32)
    // Ensure no PHI beyond first name + age
    const formJson = JSON.stringify(form)
    expect(formJson).not.toContain('patient-001') // no patient ID
    expect(formJson).toContain('Fatima')
    expect(formJson).toContain('32')
  })

  it('includes LOINC code + display name in referral form', () => {
    const sendOut = makeSendOut()
    const lab = makeReferenceLab()
    const mockSample = { type: { coding: [{ display: 'Serum' }] }, _ultranos: {} } as any

    const form = generateReferralForm(sendOut, mockSample, lab, 'Ali', 45, 'Main Lab')

    expect(form.testRequested.loincCode).toBe('2085-9')
    expect(form.testRequested.loincDisplay).toBe('Cholesterol')
  })

  it('includes reference lab attribution info', () => {
    const sendOut = makeSendOut()
    const lab = makeReferenceLab()
    const mockSample = { type: { coding: [{ display: 'Whole Blood' }] }, _ultranos: {} } as any

    const form = generateReferralForm(sendOut, mockSample, lab, 'Ahmad', 28, 'Satellite Lab')

    expect(form.referenceLabName).toBe('Kabul Reference Lab')
    expect(form.referenceLabAccreditationNumber).toBe('AFG-LAB-001')
    expect(form.originatingLabName).toBe('Satellite Lab')
  })
})

describe('generateShippingManifest', () => {
  it('groups multiple send-outs into a manifest', () => {
    const sendOut1 = makeSendOut({ id: 'so-001', sampleId: 'sample-001' })
    const sendOut2 = makeSendOut({ id: 'so-002', sampleId: 'sample-002' })
    const lab = makeReferenceLab()

    const manifest = generateShippingManifest([sendOut1, sendOut2], lab)

    expect(manifest.sendOutIds).toHaveLength(2)
    expect(manifest.items).toHaveLength(2)
    expect(manifest.referenceLabName).toBe('Kabul Reference Lab')
    expect(manifest.items[0]?.sampleId).toBe('sample-001')
    expect(manifest.items[1]?.sampleId).toBe('sample-002')
  })
})
