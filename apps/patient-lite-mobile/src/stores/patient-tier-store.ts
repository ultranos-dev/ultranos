/**
 * Patient Tier Store — Zustand store for freemium tier state.
 * Story 27.11, Task 5.
 *
 * Tracks whether the patient is on FREE or PREMIUM tier.
 * Initialized from Hub API patient profile on login.
 * Persisted to SQLCipher (encrypted local DB) for offline access.
 */
import { create } from 'zustand'
import { getEncryptedDbConnection, isDatabaseOpen } from '@/lib/encrypted-db'
import type { PatientTier } from '@ultranos/shared-types'

const TIER_TABLE = 'patient_tier_cache'

export interface PatientTierState {
  patientTier: PatientTier
  setPatientTier: (tier: PatientTier) => void
  loadFromCache: () => Promise<void>
  persistToCache: (tier: PatientTier) => Promise<void>
}

export const usePatientTierStore = create<PatientTierState>((set, get) => ({
  patientTier: 'FREE',

  setPatientTier: (tier: PatientTier) => {
    set({ patientTier: tier })
    // Fire-and-forget persistence
    get().persistToCache(tier).catch(() => {
      // Persistence failure is non-fatal — in-memory state is authoritative
    })
  },

  loadFromCache: async () => {
    if (!isDatabaseOpen()) return
    try {
      const db = await getEncryptedDbConnection()
      const rows = await db.getAllAsync<{ tier: string }>(
        `SELECT tier FROM ${TIER_TABLE} LIMIT 1`,
      )
      if (rows.length > 0) {
        const cached = rows[0].tier?.toUpperCase()
        if (cached === 'PREMIUM' || cached === 'FREE') {
          set({ patientTier: cached })
        }
      }
    } catch {
      // Cache read failure is non-fatal — defaults to FREE
    }
  },

  persistToCache: async (tier: PatientTier) => {
    if (!isDatabaseOpen()) return
    try {
      const db = await getEncryptedDbConnection()
      await db.runAsync(
        `CREATE TABLE IF NOT EXISTS ${TIER_TABLE} (id INTEGER PRIMARY KEY, tier TEXT NOT NULL)`,
      )
      await db.runAsync(
        `INSERT OR REPLACE INTO ${TIER_TABLE} (id, tier) VALUES (1, ?)`,
        [tier],
      )
    } catch {
      // Persistence failure is non-fatal
    }
  },
}))
