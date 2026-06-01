/**
 * Story 53.6 — AI Provenance Trail: Sync Drain Worker
 *
 * Syncs pending AI provenance records to the Hub API using the same
 * store-and-forward pattern as the `AuditDrainWorker` (packages/audit-logger).
 *
 * Design:
 * - Queries Dexie for records with syncStatus: 'pending'.
 * - Sends to Hub API endpoint /ai-provenance.sync.
 * - Updates syncStatus to 'synced' on success.
 * - Uses exponential backoff (1s, 4s, 16s), max 3 retries per batch.
 * - Drains on connectivity restore (PWA online event).
 * - Includes the hash chain — Hub can verify chain integrity on receipt.
 *
 * Note: The Hub API endpoint /ai-provenance.sync is a future Hub API story.
 * This worker implements the client-side sync infrastructure.
 */

import { getDb } from './db'
import type { AiProvenanceRecord } from './ai-provenance'
import { getHubApiUrl } from './trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

const BATCH_SIZE = 50
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

export interface ProvenanceSyncResult {
  id: string
  success: boolean
}

export class ProvenanceDrainWorker {
  private draining = false
  private removeListeners: (() => void) | null = null

  /** Start listening for connectivity changes and drain on restore. */
  start(): void {
    if (typeof window !== 'undefined') {
      const handler = () => void this.drain()
      window.addEventListener('online', handler)
      this.removeListeners = () => window.removeEventListener('online', handler)

      if (navigator.onLine) {
        void this.drain()
      }
    }
  }

  /** Stop listening for connectivity changes. */
  stop(): void {
    this.removeListeners?.()
    this.removeListeners = null
  }

  /** Drain all pending provenance records in batches with retry logic. */
  async drain(): Promise<void> {
    if (this.draining) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    this.draining = true

    try {
      let batch = await this._getPending(BATCH_SIZE)

      while (batch.length > 0) {
        await this._sendBatchWithRetry(batch)
        batch = await this._getPending(BATCH_SIZE)
      }
    } catch {
      // Best-effort: don't crash the app if drain fails
      console.warn('[provenance-drain] Drain cycle failed — will retry on next connectivity event')
    } finally {
      this.draining = false
    }
  }

  private async _getPending(limit: number): Promise<AiProvenanceRecord[]> {
    const db = getDb()
    return db.ai_provenance
      .where('syncStatus')
      .equals('pending')
      .limit(limit)
      .toArray() as Promise<AiProvenanceRecord[]>
  }

  private async _sendBatchWithRetry(batch: AiProvenanceRecord[]): Promise<void> {
    let attempt = 0
    let failedIds = batch.map((r) => r.id)

    while (attempt < MAX_RETRIES) {
      try {
        const results = await this._syncToHub(batch)

        const synced = results.filter((r) => r.success).map((r) => r.id)
        failedIds = results.filter((r) => !r.success).map((r) => r.id)

        if (synced.length > 0) {
          await this._markSynced(synced)
        }

        if (failedIds.length === 0) return

        attempt++
        if (attempt >= MAX_RETRIES) {
          // Leave as pending — will retry on next drain cycle
          return
        }

        await sleep(BASE_DELAY_MS * Math.pow(4, attempt - 1))
        batch = batch.filter((r) => failedIds.includes(r.id))
      } catch {
        attempt++
        if (attempt >= MAX_RETRIES) return
        await sleep(BASE_DELAY_MS * Math.pow(4, attempt - 1))
      }
    }
  }

  private async _syncToHub(records: AiProvenanceRecord[]): Promise<ProvenanceSyncResult[]> {
    const session = useAuthSessionStore.getState().session
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (session) {
      const supabase = (await import('@/lib/supabase')).getSupabaseBrowserClient()
      const { data } = await supabase.auth.getSession()
      if (data.session?.access_token) {
        headers['Authorization'] = `Bearer ${data.session.access_token}`
      }
    }

    const res = await fetch(`${getHubApiUrl()}/ai-provenance.sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ json: { records } }),
    })

    if (!res.ok) throw new Error(`ai-provenance.sync failed: ${res.status}`)

    const body = (await res.json()) as {
      result: { data: { json: { results: ProvenanceSyncResult[] } } }
    }
    return body.result.data.json.results
  }

  private async _markSynced(ids: string[]): Promise<void> {
    const db = getDb()
    await db.transaction('rw', db.ai_provenance, async () => {
      for (const id of ids) {
        const record = await db.ai_provenance.get(id)
        if (record) {
          await db.ai_provenance.put({ ...record, syncStatus: 'synced' })
        }
      }
    })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
