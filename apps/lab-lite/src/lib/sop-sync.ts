/**
 * SOP Sync — Story 46.1
 *
 * Fetches SOPs from the Hub API, compares with local Dexie cache,
 * upserts new/updated SOPs, and syncs acknowledgments back to Hub.
 * No patient data involved (CLAUDE.md Rule #7 non-applicable).
 */

import { getDb, putSOPs, getPendingSOPAcknowledgments, markAcknowledgmentsSynced } from '@/lib/db'
import type { SOP } from '@/lib/sop-types'

const HUB_API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
    : process.env.HUB_API_URL ?? 'http://localhost:3000/api/trpc'

export interface SOPSyncResult {
  newCount: number
  updatedCount: number
  totalActive: number
}

/**
 * Sync SOPs from the Hub API into the local Dexie cache.
 * Compares `meta.lastUpdated` to detect new/updated SOPs.
 * Superseded SOPs are retained locally but hidden from active library.
 */
export async function syncSOPs(token: string): Promise<SOPSyncResult> {
  const db = getDb()

  const res = await fetch(`${HUB_API_URL}/lab.listSOPs`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    throw new Error(`SOP sync failed: ${res.status}`)
  }

  const body = (await res.json()) as {
    result: { data: { json: { sops: SOP[] } } }
  }
  const remoteSops = body.result.data.json.sops ?? []

  if (remoteSops.length === 0) {
    const totalActive = await db.sops.where('status').equals('active').count()
    return { newCount: 0, updatedCount: 0, totalActive }
  }

  // Build a map of local SOPs for comparison
  const localSops = await db.sops.toArray()
  const localMap = new Map(localSops.map((s) => [s.id, s]))

  let newCount = 0
  let updatedCount = 0
  const toUpsert: SOP[] = []

  for (const remote of remoteSops) {
    const local = localMap.get(remote.id)
    if (!local) {
      newCount++
      toUpsert.push(remote)
    } else if (remote.meta.lastUpdated > local.meta.lastUpdated) {
      updatedCount++
      toUpsert.push(remote)
    }
  }

  if (toUpsert.length > 0) {
    await putSOPs(toUpsert)
  }

  const totalActive = await db.sops.where('status').equals('active').count()
  return { newCount, updatedCount, totalActive }
}

/**
 * Sync pending SOP acknowledgments from Dexie to the Hub API.
 * Fire-and-forget — acknowledgments are durable in Dexie and retry on next sync.
 */
export async function syncSOPAcknowledgments(token: string): Promise<number> {
  const pending = await getPendingSOPAcknowledgments()
  if (pending.length === 0) return 0

  const res = await fetch(`${HUB_API_URL}/lab.syncSOPAcknowledgments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ json: { acknowledgments: pending } }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    throw new Error(`Acknowledgment sync failed: ${res.status}`)
  }

  const syncedIds = pending.map((a) => a.id)
  await markAcknowledgmentsSynced(syncedIds)
  return syncedIds.length
}

/**
 * Get unacknowledged SOPs for a specific technician.
 * Returns active SOPs where the technician hasn't acknowledged the current version.
 */
export async function getUnacknowledgedSOPs(
  technicianId: string,
): Promise<SOP[]> {
  const db = getDb()
  const activeSops = await db.sops.where('status').equals('active').toArray()
  if (activeSops.length === 0) return []

  const acks = await db.sop_acknowledgments
    .where('technicianId')
    .equals(technicianId)
    .toArray()

  const ackedVersions = new Set(
    acks.map((a) => `${a.sopId}:${a.sopVersion}`),
  )

  return activeSops.filter(
    (sop) => !ackedVersions.has(`${sop.id}:${sop.version}`),
  )
}
