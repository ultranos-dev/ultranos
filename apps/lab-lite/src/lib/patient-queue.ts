import { getDb } from '@/lib/db'
import type { TokenColor, TokenSymbol } from '@/lib/token-generator'

export interface PatientQueueEntry {
  id?: number
  patientRef: string
  patientFirstName: string // first name only — data minimization
  patientAge: number
  tokenColor: TokenColor
  tokenSymbol: TokenSymbol
  tokenDisplayKey: string
  status: 'waiting' | 'serving' | 'completed' | 'no-show'
  registeredAt: string // ISO 8601
  calledAt?: string
  completedAt?: string
  hlcTimestamp: string
  techId: string
  /** Serialized TripAnalysis (JSON) — ephemeral, local only, not synced to Hub */
  tripOptimizationResult?: string
}

/** Add a patient to the queue. Returns the auto-generated ID. */
export async function addToPatientQueue(
  entry: Omit<PatientQueueEntry, 'id'>,
): Promise<number> {
  const db = getDb()
  return db.table('queueEntries').add(entry)
}

/** Get all waiting + serving entries, ordered oldest-first by registeredAt. */
export async function getActiveQueue(): Promise<PatientQueueEntry[]> {
  const db = getDb()
  return db
    .table('queueEntries')
    .where('status')
    .anyOf(['waiting', 'serving'])
    .sortBy('registeredAt')
}

/** Move a queue entry to "serving" status. */
export async function callNextPatient(id: number): Promise<void> {
  const db = getDb()
  await db.table('queueEntries').update(id, {
    status: 'serving',
    calledAt: new Date().toISOString(),
  })
}

/** Mark a queue entry as completed. */
export async function completeQueueEntry(id: number): Promise<void> {
  const db = getDb()
  await db.table('queueEntries').update(id, {
    status: 'completed',
    completedAt: new Date().toISOString(),
  })
}

/** Save trip optimization result on a queue entry (ephemeral, not synced). */
export async function saveTripResult(id: number, result: string): Promise<void> {
  const db = getDb()
  await db.table('queueEntries').update(id, { tripOptimizationResult: result })
}

/** Mark a queue entry as no-show. */
export async function markNoShow(id: number): Promise<void> {
  const db = getDb()
  await db.table('queueEntries').update(id, {
    status: 'no-show',
    completedAt: new Date().toISOString(),
  })
}

/** Get all queue entries for a specific date (YYYY-MM-DD). */
export async function getQueueHistory(
  date: string,
): Promise<PatientQueueEntry[]> {
  const db = getDb()
  const dayStart = `${date}T00:00:00.000Z`
  const dayEnd = `${date}T23:59:59.999Z`
  return db
    .table('queueEntries')
    .where('registeredAt')
    .between(dayStart, dayEnd, true, true)
    .toArray()
}

/** Remove completed and no-show entries, freeing their tokens. */
export async function clearCompletedEntries(): Promise<void> {
  const db = getDb()
  await db
    .table('queueEntries')
    .where('status')
    .anyOf(['completed', 'no-show'])
    .delete()
}
