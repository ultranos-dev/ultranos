import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

vi.mock('../lib/audit-client', () => ({
  reportSampleAuditEvent: vi.fn(),
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test-node' }) },
  serializeHlc: () => 'mock-hlc-timestamp',
}))

vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ session: { practitionerId: 'tech-001', userId: 'user-001' } }),
  },
}))

Object.defineProperty(navigator, 'onLine', { value: true, writable: true })

import { generateSampleId, getTodayYYYYMMDD } from '../lib/sample-id'
import { accessionSample } from '../lib/sample-service'
import { getDb } from '../lib/db'

const BASE_INPUT = {
  orderId: 'order-001',
  sampleType: 'blood',
  condition: 'acceptable' as const,
  receivedFromId: 'courier-001',
  patientRef: 'Patient/patient-uuid-001',
}

describe('getTodayYYYYMMDD', () => {
  it('returns YYYYMMDD format', () => {
    const result = getTodayYYYYMMDD()
    expect(result).toMatch(/^\d{8}$/)
  })

  it('matches today\'s date', () => {
    const now = new Date()
    const expected =
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0')
    expect(getTodayYYYYMMDD()).toBe(expected)
  })
})

describe('generateSampleId', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.samples.clear()
    await db.custody_events.clear()
    await db.syncQueue.clear()
  })

  it('generates LAB prefix by default with correct format', async () => {
    const id = await generateSampleId()
    const today = getTodayYYYYMMDD()
    expect(id).toMatch(/^LAB-\d{8}-\d{4}$/)
    expect(id).toBe(`LAB-${today}-0001`)
  })

  it('increments daily sequence as specimens are accessioned', async () => {
    // Accession (persists specimens) then check IDs are sequential
    const first = await accessionSample(BASE_INPUT)
    const second = await accessionSample({ ...BASE_INPUT, orderId: 'order-002' })
    const third = await accessionSample({ ...BASE_INPUT, orderId: 'order-003' })

    const today = getTodayYYYYMMDD()
    expect(first._ultranos.labSampleId).toBe(`LAB-${today}-0001`)
    expect(second._ultranos.labSampleId).toBe(`LAB-${today}-0002`)
    expect(third._ultranos.labSampleId).toBe(`LAB-${today}-0003`)
  })

  it('supports custom prefix', async () => {
    const id = await generateSampleId('KNDZ')
    const today = getTodayYYYYMMDD()
    expect(id).toBe(`KNDZ-${today}-0001`)
  })

  it('does not conflict between different prefixes', async () => {
    const lab1 = await accessionSample(BASE_INPUT)
    const kndz1 = await accessionSample({ ...BASE_INPUT, orderId: 'order-k', idPrefix: 'KNDZ' })
    const today = getTodayYYYYMMDD()
    expect(lab1._ultranos.labSampleId).toBe(`LAB-${today}-0001`)
    expect(kndz1._ultranos.labSampleId).toBe(`KNDZ-${today}-0001`)
  })

  it('handles collision by incrementing (collision retry)', async () => {
    // Manually insert a sample with the ID that would be generated first
    const db = getDb()
    const today = getTodayYYYYMMDD()
    const conflictId = `LAB-${today}-0001`

    await db.samples.put({
      id: crypto.randomUUID(),
      resourceType: 'Specimen',
      status: 'available',
      subject: { reference: 'Patient/test-001' },
      receivedTime: new Date().toISOString(),
      meta: { lastUpdated: new Date().toISOString(), versionId: '1' },
      _ultranos: {
        labSampleId: conflictId,
        hlcTimestamp: 'mock-hlc',
        createdAt: new Date().toISOString(),
        isOfflineCreated: false,
        pipelineStatus: 'received',
        sampleCondition: 'acceptable',
      },
    })

    // Next generate should skip 0001 and produce 0002
    const id = await generateSampleId()
    expect(id).toBe(`LAB-${today}-0002`)
  })
})
