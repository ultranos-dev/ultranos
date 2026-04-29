import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useFulfillmentStore } from '@/stores/fulfillment-store'
import type { VerifiedPrescription } from '@/lib/prescription-verify'
import { db } from '@/lib/db'

// Mock fetch for sync tests
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
  {
    id: 'rx-002',
    med: 'IBU400',
    medN: 'Ibuprofen',
    medT: 'Ibuprofen 400mg Tablet',
    dos: { qty: 1, unit: 'tablet', freqN: 2, per: 1, perU: 'd' },
    dur: 5,
    req: 'pract-001',
    pat: 'pat-001',
    at: '2026-04-28T10:00:00Z',
  },
]

beforeEach(async () => {
  useFulfillmentStore.getState().reset()
  vi.clearAllMocks()
  await db.delete()
  await db.open()
})

describe('FulfillmentStore', () => {
  it('starts in empty phase with no items', () => {
    const state = useFulfillmentStore.getState()
    expect(state.phase).toBe('empty')
    expect(state.items).toHaveLength(0)
    expect(state.practitionerName).toBeNull()
  })

  it('loads prescriptions into fulfillment view (AC 4)', () => {
    useFulfillmentStore.getState().loadPrescriptions(sampleRx, 'Dr. Ahmad')

    const state = useFulfillmentStore.getState()
    expect(state.phase).toBe('loaded')
    expect(state.items).toHaveLength(2)
    expect(state.items[0]!.prescription.medN).toBe('Amoxicillin')
    expect(state.items[1]!.prescription.medN).toBe('Ibuprofen')
    expect(state.practitionerName).toBe('Dr. Ahmad')
    expect(state.scannedAt).toBeTruthy()
  })

  it('all items are selected by default on load', () => {
    useFulfillmentStore.getState().loadPrescriptions(sampleRx)

    const state = useFulfillmentStore.getState()
    expect(state.items.every((i) => i.selected)).toBe(true)
  })

  it('toggles individual item selection', () => {
    useFulfillmentStore.getState().loadPrescriptions(sampleRx)
    useFulfillmentStore.getState().toggleItem('rx-001')

    const state = useFulfillmentStore.getState()
    expect(state.items[0]!.selected).toBe(false)
    expect(state.items[1]!.selected).toBe(true)
  })

  it('deselects all and selects all', () => {
    useFulfillmentStore.getState().loadPrescriptions(sampleRx)
    useFulfillmentStore.getState().deselectAll()

    expect(useFulfillmentStore.getState().items.every((i) => !i.selected)).toBe(true)

    useFulfillmentStore.getState().selectAll()
    expect(useFulfillmentStore.getState().items.every((i) => i.selected)).toBe(true)
  })

  it('transitions to reviewing phase when items selected', () => {
    useFulfillmentStore.getState().loadPrescriptions(sampleRx)
    useFulfillmentStore.getState().startReview()

    expect(useFulfillmentStore.getState().phase).toBe('reviewing')
  })

  it('does not transition to reviewing if no items selected', () => {
    useFulfillmentStore.getState().loadPrescriptions(sampleRx)
    useFulfillmentStore.getState().deselectAll()
    useFulfillmentStore.getState().startReview()

    expect(useFulfillmentStore.getState().phase).toBe('loaded')
  })

  it('resets to empty state', () => {
    useFulfillmentStore.getState().loadPrescriptions(sampleRx, 'Dr. Ahmad')
    useFulfillmentStore.getState().reset()

    const state = useFulfillmentStore.getState()
    expect(state.phase).toBe('empty')
    expect(state.items).toHaveLength(0)
    expect(state.practitionerName).toBeNull()
    expect(state.scannedAt).toBeNull()
  })

  it('loads medication details: Name, Dosage, Frequency (AC 4)', () => {
    useFulfillmentStore.getState().loadPrescriptions(sampleRx)

    const item = useFulfillmentStore.getState().items[0]!.prescription
    expect(item.medN).toBe('Amoxicillin')           // Name
    expect(item.dos.qty).toBe(1)                      // Dosage quantity
    expect(item.dos.unit).toBe('capsule')             // Dosage unit
    expect(item.dos.freqN).toBe(3)                    // Frequency
    expect(item.dos.perU).toBe('d')                   // Per day
  })
})

describe('FulfillmentStore confirmDispense (Story 4.3)', () => {
  it('transitions through dispensing → completed phases (AC 1)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { data: { json: { success: true, dispenseId: 'd-1', prescriptionStatus: 'completed' } } },
      }),
    })

    useFulfillmentStore.getState().loadPrescriptions(sampleRx)
    useFulfillmentStore.getState().startReview()

    await useFulfillmentStore.getState().confirmDispense('pharmacist-001')

    expect(useFulfillmentStore.getState().phase).toBe('completed')
    expect(useFulfillmentStore.getState().syncStatus.isPending).toBe(false)
  })

  it('persists dispense records locally before syncing (offline-first)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { data: { json: { success: true, dispenseId: 'd-1', prescriptionStatus: 'completed' } } },
      }),
    })

    useFulfillmentStore.getState().loadPrescriptions(sampleRx)
    await useFulfillmentStore.getState().confirmDispense('pharmacist-001')

    const dispenses = await db.dispenses.toArray()
    expect(dispenses).toHaveLength(2) // 2 items in sampleRx
  })

  it('creates audit log entries for each dispense', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { data: { json: { success: true, dispenseId: 'd-1', prescriptionStatus: 'completed' } } },
      }),
    })

    useFulfillmentStore.getState().loadPrescriptions(sampleRx)
    await useFulfillmentStore.getState().confirmDispense('pharmacist-001')

    const auditEntries = await db.dispenseAuditLog.toArray()
    expect(auditEntries).toHaveLength(2)
    expect(auditEntries.every((e) => e.action === 'created')).toBe(true)
  })

  it('queues to sync_queue when offline (AC 3)', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))

    useFulfillmentStore.getState().loadPrescriptions(sampleRx)
    await useFulfillmentStore.getState().confirmDispense('pharmacist-001')

    expect(useFulfillmentStore.getState().phase).toBe('completed')

    const queued = await db.syncQueue.toArray()
    expect(queued).toHaveLength(2)
    expect(queued.every((q) => q.status === 'pending')).toBe(true)
  })

  it('only dispenses selected items', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { data: { json: { success: true, dispenseId: 'd-1', prescriptionStatus: 'completed' } } },
      }),
    })

    useFulfillmentStore.getState().loadPrescriptions(sampleRx)
    useFulfillmentStore.getState().toggleItem('rx-002') // deselect 2nd item
    await useFulfillmentStore.getState().confirmDispense('pharmacist-001')

    const dispenses = await db.dispenses.toArray()
    expect(dispenses).toHaveLength(1)
    expect(dispenses[0]!.authorizingPrescription![0]!.reference).toBe('MedicationRequest/rx-001')
  })

  it('does nothing when no items selected', async () => {
    useFulfillmentStore.getState().loadPrescriptions(sampleRx)
    useFulfillmentStore.getState().deselectAll()
    await useFulfillmentStore.getState().confirmDispense('pharmacist-001')

    expect(useFulfillmentStore.getState().phase).toBe('loaded')
    const dispenses = await db.dispenses.toArray()
    expect(dispenses).toHaveLength(0)
  })

  it('tracks sync status with pendingCount (AC 4)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { data: { json: { success: true, dispenseId: 'd-1', prescriptionStatus: 'completed' } } },
      }),
    })

    useFulfillmentStore.getState().loadPrescriptions(sampleRx)
    await useFulfillmentStore.getState().confirmDispense('pharmacist-001')

    const { syncStatus } = useFulfillmentStore.getState()
    expect(syncStatus.isPending).toBe(false)
    expect(syncStatus.pendingCount).toBe(0)
    expect(syncStatus.lastSyncResult).toBeTruthy()
  })
})
