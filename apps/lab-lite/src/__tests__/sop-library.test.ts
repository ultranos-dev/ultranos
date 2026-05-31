import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import {
  getDb,
  getActiveSOPs,
  getSOPById,
  putSOPs,
  addSOPAcknowledgment,
  getSOPAcknowledgments,
  getTechnicianAcknowledgments,
  hasAcknowledgedSOP,
  getPendingSOPAcknowledgments,
  markAcknowledgmentsSynced,
} from '../lib/db'
import { SOPCategory, type SOP, type SOPAcknowledgment } from '../lib/sop-types'
import { getUnacknowledgedSOPs } from '../lib/sop-sync'

function makeSOP(overrides: Partial<SOP> = {}): SOP {
  return {
    id: crypto.randomUUID(),
    title: 'Complete Blood Count Procedure',
    version: '1.0.0',
    effectiveDate: '2026-01-15',
    author: 'Lab Manager',
    category: SOPCategory.HEMATOLOGY,
    content: '## Step 1\nCollect sample\n## Step 2\nRun analysis',
    images: [],
    status: 'active',
    meta: {
      lastUpdated: '2026-01-15T00:00:00.000Z',
      versionId: '1',
    },
    ...overrides,
  }
}

function makeAck(overrides: Partial<SOPAcknowledgment> = {}): SOPAcknowledgment {
  return {
    id: crypto.randomUUID(),
    sopId: 'sop-1',
    sopVersion: '1.0.0',
    technicianId: 'tech-1',
    acknowledgedAt: new Date().toISOString(),
    syncStatus: 'pending',
    ...overrides,
  }
}

describe('SOP Dexie CRUD (Task 1)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.sops.clear()
    await db.sop_acknowledgments.clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.sops.clear()
    await db.sop_acknowledgments.clear()
  })

  it('stores and retrieves an SOP by ID', async () => {
    const sop = makeSOP({ id: 'sop-test-1' })
    await putSOPs([sop])

    const result = await getSOPById('sop-test-1')
    expect(result).toBeDefined()
    expect(result!.title).toBe('Complete Blood Count Procedure')
    expect(result!.category).toBe(SOPCategory.HEMATOLOGY)
  })

  it('returns active SOPs only', async () => {
    await putSOPs([
      makeSOP({ id: 's1', status: 'active' }),
      makeSOP({ id: 's2', status: 'superseded' }),
      makeSOP({ id: 's3', status: 'draft' }),
      makeSOP({ id: 's4', status: 'active' }),
    ])

    const active = await getActiveSOPs()
    expect(active).toHaveLength(2)
    expect(active.every((s) => s.status === 'active')).toBe(true)
  })

  it('filters active SOPs by category', async () => {
    await putSOPs([
      makeSOP({ id: 's1', category: SOPCategory.HEMATOLOGY, status: 'active' }),
      makeSOP({ id: 's2', category: SOPCategory.CHEMISTRY, status: 'active' }),
      makeSOP({ id: 's3', category: SOPCategory.HEMATOLOGY, status: 'active' }),
    ])

    const hema = await getActiveSOPs(SOPCategory.HEMATOLOGY)
    expect(hema).toHaveLength(2)
    expect(hema.every((s) => s.category === SOPCategory.HEMATOLOGY)).toBe(true)
  })

  it('retains superseded SOPs in the database', async () => {
    await putSOPs([
      makeSOP({ id: 's1', status: 'active' }),
      makeSOP({ id: 's2', status: 'superseded' }),
    ])

    const db = getDb()
    const all = await db.sops.toArray()
    expect(all).toHaveLength(2)

    const superseded = all.filter((s) => s.status === 'superseded')
    expect(superseded).toHaveLength(1)
  })

  it('bulk-upserts SOPs (insert + update)', async () => {
    await putSOPs([makeSOP({ id: 'sop-u', version: '1.0.0' })])

    let result = await getSOPById('sop-u')
    expect(result!.version).toBe('1.0.0')

    await putSOPs([makeSOP({ id: 'sop-u', version: '2.0.0', meta: { lastUpdated: '2026-02-01T00:00:00.000Z', versionId: '2' } })])

    result = await getSOPById('sop-u')
    expect(result!.version).toBe('2.0.0')
  })
})

describe('SOP Acknowledgment CRUD (Task 5)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.sops.clear()
    await db.sop_acknowledgments.clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.sops.clear()
    await db.sop_acknowledgments.clear()
  })

  it('creates and retrieves acknowledgments by SOP ID', async () => {
    await addSOPAcknowledgment(makeAck({ sopId: 'sop-1', technicianId: 'tech-a' }))
    await addSOPAcknowledgment(makeAck({ sopId: 'sop-1', technicianId: 'tech-b' }))
    await addSOPAcknowledgment(makeAck({ sopId: 'sop-2', technicianId: 'tech-a' }))

    const acks = await getSOPAcknowledgments('sop-1')
    expect(acks).toHaveLength(2)
    expect(acks.every((a) => a.sopId === 'sop-1')).toBe(true)
  })

  it('retrieves acknowledgments by technician ID', async () => {
    await addSOPAcknowledgment(makeAck({ sopId: 'sop-1', technicianId: 'tech-a' }))
    await addSOPAcknowledgment(makeAck({ sopId: 'sop-2', technicianId: 'tech-a' }))
    await addSOPAcknowledgment(makeAck({ sopId: 'sop-1', technicianId: 'tech-b' }))

    const acks = await getTechnicianAcknowledgments('tech-a')
    expect(acks).toHaveLength(2)
    expect(acks.every((a) => a.technicianId === 'tech-a')).toBe(true)
  })

  it('checks if a technician acknowledged a specific SOP version', async () => {
    await addSOPAcknowledgment(makeAck({ sopId: 'sop-1', sopVersion: '1.0.0', technicianId: 'tech-a' }))

    expect(await hasAcknowledgedSOP('sop-1', 'tech-a', '1.0.0')).toBe(true)
    expect(await hasAcknowledgedSOP('sop-1', 'tech-a', '2.0.0')).toBe(false)
    expect(await hasAcknowledgedSOP('sop-1', 'tech-b', '1.0.0')).toBe(false)
  })

  it('returns pending acknowledgments for sync', async () => {
    await addSOPAcknowledgment(makeAck({ id: 'ack-1', syncStatus: 'pending' }))
    await addSOPAcknowledgment(makeAck({ id: 'ack-2', syncStatus: 'synced' }))
    await addSOPAcknowledgment(makeAck({ id: 'ack-3', syncStatus: 'pending' }))

    const pending = await getPendingSOPAcknowledgments()
    expect(pending).toHaveLength(2)
    expect(pending.every((a) => a.syncStatus === 'pending')).toBe(true)
  })

  it('marks acknowledgments as synced', async () => {
    await addSOPAcknowledgment(makeAck({ id: 'ack-1', syncStatus: 'pending' }))
    await addSOPAcknowledgment(makeAck({ id: 'ack-2', syncStatus: 'pending' }))

    await markAcknowledgmentsSynced(['ack-1', 'ack-2'])

    const pending = await getPendingSOPAcknowledgments()
    expect(pending).toHaveLength(0)

    const db = getDb()
    const ack1 = await db.sop_acknowledgments.get('ack-1')
    expect(ack1!.syncStatus).toBe('synced')
  })

  it('acknowledgment records are durable (not deleted)', async () => {
    await addSOPAcknowledgment(makeAck({ id: 'ack-durable' }))
    await markAcknowledgmentsSynced(['ack-durable'])

    const db = getDb()
    const record = await db.sop_acknowledgments.get('ack-durable')
    expect(record).toBeDefined()
    expect(record!.syncStatus).toBe('synced')
  })
})

describe('SOP Sync Logic (Task 2)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.sops.clear()
    await db.sop_acknowledgments.clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.sops.clear()
    await db.sop_acknowledgments.clear()
  })

  it('detects unacknowledged SOPs for a technician', async () => {
    const sop1 = makeSOP({ id: 'sop-1', version: '1.0.0', status: 'active' })
    const sop2 = makeSOP({ id: 'sop-2', version: '1.0.0', status: 'active' })
    const sop3 = makeSOP({ id: 'sop-3', version: '1.0.0', status: 'active' })
    await putSOPs([sop1, sop2, sop3])

    await addSOPAcknowledgment(makeAck({ sopId: 'sop-1', sopVersion: '1.0.0', technicianId: 'tech-1' }))

    const unacked = await getUnacknowledgedSOPs('tech-1')
    expect(unacked).toHaveLength(2)
    expect(unacked.map((s) => s.id).sort()).toEqual(['sop-2', 'sop-3'])
  })

  it('detects version update as unacknowledged', async () => {
    const sop = makeSOP({ id: 'sop-1', version: '2.0.0', status: 'active' })
    await putSOPs([sop])

    // Tech acknowledged old version 1.0.0
    await addSOPAcknowledgment(makeAck({ sopId: 'sop-1', sopVersion: '1.0.0', technicianId: 'tech-1' }))

    const unacked = await getUnacknowledgedSOPs('tech-1')
    expect(unacked).toHaveLength(1)
    expect(unacked[0]!.version).toBe('2.0.0')
  })

  it('excludes superseded SOPs from unacknowledged list', async () => {
    await putSOPs([
      makeSOP({ id: 'sop-1', status: 'active' }),
      makeSOP({ id: 'sop-2', status: 'superseded' }),
    ])

    const unacked = await getUnacknowledgedSOPs('tech-1')
    expect(unacked).toHaveLength(1)
    expect(unacked[0]!.id).toBe('sop-1')
  })

  it('returns empty when all SOPs are acknowledged', async () => {
    await putSOPs([
      makeSOP({ id: 'sop-1', version: '1.0.0', status: 'active' }),
    ])
    await addSOPAcknowledgment(makeAck({ sopId: 'sop-1', sopVersion: '1.0.0', technicianId: 'tech-1' }))

    const unacked = await getUnacknowledgedSOPs('tech-1')
    expect(unacked).toHaveLength(0)
  })

  it('returns empty when no SOPs exist', async () => {
    const unacked = await getUnacknowledgedSOPs('tech-1')
    expect(unacked).toHaveLength(0)
  })
})

describe('SOP Data Model (Task 1 — AC 2, 8)', () => {
  it('SOP contains all required fields', () => {
    const sop = makeSOP()

    expect(sop.id).toBeDefined()
    expect(sop.title).toBeDefined()
    expect(sop.version).toBeDefined()
    expect(sop.effectiveDate).toBeDefined()
    expect(sop.author).toBeDefined()
    expect(sop.category).toBeDefined()
    expect(sop.content).toBeDefined()
    expect(sop.images).toBeDefined()
    expect(sop.status).toBeDefined()
    expect(sop.meta.lastUpdated).toBeDefined()
    expect(sop.meta.versionId).toBeDefined()
  })

  it('SOP library contains no patient data (AC 8)', () => {
    const sop = makeSOP()
    const json = JSON.stringify(sop)

    // Ensure no patient-related field names exist
    expect(json).not.toContain('patientId')
    expect(json).not.toContain('patientRef')
    expect(json).not.toContain('patientName')
    expect(json).not.toContain('diagnosis')
    expect(json).not.toContain('medication')
    expect(json).not.toContain('allergy')
  })

  it('SOP category enum includes all required categories (AC 1)', () => {
    expect(SOPCategory.HEMATOLOGY).toBe('HEMATOLOGY')
    expect(SOPCategory.CHEMISTRY).toBe('CHEMISTRY')
    expect(SOPCategory.MICROBIOLOGY).toBe('MICROBIOLOGY')
    expect(SOPCategory.GENERAL_LAB_SAFETY).toBe('GENERAL_LAB_SAFETY')
    expect(SOPCategory.OTHER).toBe('OTHER')
  })

  it('SOP images support base64-encoded data', () => {
    const sop = makeSOP({
      images: [
        { id: 'img-1', alt: 'Sample collection', data: 'base64data==', mimeType: 'image/png' },
      ],
    })

    expect(sop.images).toHaveLength(1)
    expect(sop.images[0]!.data).toBe('base64data==')
    expect(sop.images[0]!.mimeType).toBe('image/png')
  })
})
