/**
 * Module Sync — Story 46.2 (Task 6)
 *
 * Fetches micro-learning modules from the Hub API and upserts into Dexie.
 * Modules are fully self-contained (all images as base64) — no external asset refs.
 * Also syncs pending ModuleCompletion records back to the Hub.
 *
 * Called as part of the existing sync cycle.
 * No patient data involved (CLAUDE.md Rule #7 non-applicable).
 */

import {
  getDb,
  upsertMicroLearningModules,
  getPendingModuleCompletions,
  markModuleCompletionsSynced,
} from '@/lib/db'
import type { MicroLearningModule } from '@/lib/micro-learning-types'

const HUB_API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
    : process.env.HUB_API_URL ?? 'http://localhost:3000/api/trpc'

export interface ModuleSyncResult {
  newCount: number
  updatedCount: number
  totalModules: number
}

/**
 * Sync micro-learning modules from the Hub API into local Dexie.
 * Uses meta.lastUpdated for change detection (same pattern as SOP sync).
 * Modules are fully offline-capable — no streaming, no external assets.
 */
export async function syncModules(token: string): Promise<ModuleSyncResult> {
  const db = getDb()

  const res = await fetch(`${HUB_API_URL}/lab.listLearningModules`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    throw new Error(`Module sync failed: ${res.status}`)
  }

  const body = (await res.json()) as {
    result: { data: { json: { modules: MicroLearningModule[] } } }
  }
  const remoteModules = body.result.data.json.modules ?? []

  if (remoteModules.length === 0) {
    const totalModules = await db.micro_learning_modules.count()
    return { newCount: 0, updatedCount: 0, totalModules }
  }

  // Build local map for comparison
  const localModules = await db.micro_learning_modules.toArray()
  const localMap = new Map(localModules.map((m) => [m.id, m]))

  let newCount = 0
  let updatedCount = 0
  const toUpsert: MicroLearningModule[] = []

  for (const remote of remoteModules) {
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
    await upsertMicroLearningModules(toUpsert)
  }

  const totalModules = await db.micro_learning_modules.count()
  return { newCount, updatedCount, totalModules }
}

/**
 * Push pending module completion records to the Hub.
 * Fire-and-forget pattern — completions are durable in Dexie.
 * Returns the number of completions successfully synced.
 */
export async function syncModuleCompletions(token: string): Promise<number> {
  const pending = await getPendingModuleCompletions()
  if (pending.length === 0) return 0

  const res = await fetch(`${HUB_API_URL}/lab.syncModuleCompletions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ json: { completions: pending } }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    throw new Error(`Module completion sync failed: ${res.status}`)
  }

  const syncedIds = pending.map((c) => c.id)
  await markModuleCompletionsSynced(syncedIds)
  return syncedIds.length
}
