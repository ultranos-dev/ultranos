import { describe, it, expect, beforeEach } from 'vitest'
import Dexie from 'dexie'
import 'fake-indexeddb/auto'
import { getDb } from '@/lib/db'
import {
  addToPatientQueue,
  getActiveQueue,
  callNextPatient,
  completeQueueEntry,
  markNoShow,
  getQueueHistory,
  clearCompletedEntries,
  type PatientQueueEntry,
} from '@/lib/patient-queue'

// Reset Dexie between tests
beforeEach(async () => {
  const db = getDb()
  if (db.isOpen()) {
    await db.table('queueEntries').clear()
  }
})

function makeEntry(
  overrides?: Partial<PatientQueueEntry>,
): Omit<PatientQueueEntry, 'id'> {
  return {
    patientRef: 'Patient/test-123',
    patientFirstName: 'Ahmad',
    patientAge: 35,
    tokenColor: 'blue',
    tokenSymbol: 'star',
    tokenDisplayKey: 'blue-star',
    status: 'waiting',
    registeredAt: new Date().toISOString(),
    hlcTimestamp: '2026-05-30T10:00:00.000Z_0000_node1',
    techId: 'tech-001',
    ...overrides,
  }
}

describe('patient-queue Dexie CRUD', () => {
  it('addToPatientQueue inserts and returns an id', async () => {
    const id = await addToPatientQueue(makeEntry())
    expect(id).toBeGreaterThan(0)
  })

  it('getActiveQueue returns waiting + serving entries ordered by registeredAt', async () => {
    const earlier = new Date('2026-05-30T08:00:00Z').toISOString()
    const later = new Date('2026-05-30T09:00:00Z').toISOString()

    await addToPatientQueue(
      makeEntry({ registeredAt: later, tokenDisplayKey: 'red-circle' }),
    )
    await addToPatientQueue(
      makeEntry({ registeredAt: earlier, tokenDisplayKey: 'blue-star' }),
    )
    await addToPatientQueue(
      makeEntry({
        status: 'completed',
        tokenDisplayKey: 'green-triangle',
        registeredAt: earlier,
      }),
    )

    const active = await getActiveQueue()
    expect(active).toHaveLength(2)
    // Oldest first
    expect(active[0].tokenDisplayKey).toBe('blue-star')
    expect(active[1].tokenDisplayKey).toBe('red-circle')
  })

  it('callNextPatient sets status to serving and records calledAt', async () => {
    const id = await addToPatientQueue(makeEntry())
    await callNextPatient(id)

    const db = getDb()
    const entry = await db.table('queueEntries').get(id)
    expect(entry.status).toBe('serving')
    expect(entry.calledAt).toBeDefined()
  })

  it('completeQueueEntry sets status to completed and records completedAt', async () => {
    const id = await addToPatientQueue(makeEntry())
    await completeQueueEntry(id)

    const db = getDb()
    const entry = await db.table('queueEntries').get(id)
    expect(entry.status).toBe('completed')
    expect(entry.completedAt).toBeDefined()
  })

  it('markNoShow sets status to no-show', async () => {
    const id = await addToPatientQueue(makeEntry())
    await markNoShow(id)

    const db = getDb()
    const entry = await db.table('queueEntries').get(id)
    expect(entry.status).toBe('no-show')
  })

  it('getQueueHistory returns entries for a specific date', async () => {
    const today = '2026-05-30'
    await addToPatientQueue(
      makeEntry({
        registeredAt: `${today}T08:00:00.000Z`,
        tokenDisplayKey: 'blue-star',
      }),
    )
    await addToPatientQueue(
      makeEntry({
        registeredAt: '2026-05-29T08:00:00.000Z',
        tokenDisplayKey: 'red-circle',
      }),
    )

    const history = await getQueueHistory(today)
    expect(history).toHaveLength(1)
    expect(history[0].tokenDisplayKey).toBe('blue-star')
  })

  it('clearCompletedEntries removes completed and no-show entries', async () => {
    await addToPatientQueue(
      makeEntry({ status: 'waiting', tokenDisplayKey: 'blue-star' }),
    )
    await addToPatientQueue(
      makeEntry({ status: 'completed', tokenDisplayKey: 'red-circle' }),
    )
    await addToPatientQueue(
      makeEntry({ status: 'no-show', tokenDisplayKey: 'green-triangle' }),
    )

    await clearCompletedEntries()

    const db = getDb()
    const remaining = await db.table('queueEntries').toArray()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].tokenDisplayKey).toBe('blue-star')
  })
})
