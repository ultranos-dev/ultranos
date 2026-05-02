/**
 * Tiered conflict resolution engine for offline-first sync.
 *
 * Pure function — no side effects, no database access. Takes two
 * divergent versions and returns a resolution based on clinical
 * safety tiers.
 *
 * Tier 1 (Safety-Critical): Append-only merge. Both kept. Conflict flagged.
 * Tier 2 (Clinical): Timestamp wins. Both kept as addenda.
 * Tier 3 (Operational): Last-Write-Wins. Only winner kept.
 * Consent: Append-only ledger (no prescription blocking).
 * Queue: 60-second HLC conflict window flagging.
 */

import type { HlcTimestamp } from './hlc.js'
import { compareHlc } from './hlc.js'
import { getConflictTier, type ConflictTier } from './conflict-tiers.js'

export interface SyncRecord {
  id: string
  data: Record<string, unknown>
  hlcTimestamp: HlcTimestamp
  version: string
}

export type ConflictStrategy = 'APPEND_ONLY' | 'TIMESTAMP_WINS' | 'LWW'

export interface ConflictResolution {
  strategy: ConflictStrategy
  winner?: 'local' | 'remote'
  kept: SyncRecord[]
  conflictFlag: boolean
  blocksPrescription: boolean
}

/** 60-second conflict window in milliseconds. */
const CONFLICT_WINDOW_MS = 60_000

/**
 * Determine the effective conflict tier for a resource, accounting for
 * active vs. historical status on Tier 1 resources.
 *
 * Tier 1 only applies to active resources. Historical MedicationRequest
 * (status !== 'active') or resolved Condition (clinicalStatus !== 'active')
 * fall to Tier 2.
 */
function getEffectiveTier(resourceType: string, data: Record<string, unknown>): ConflictTier {
  const baseTier = getConflictTier(resourceType)

  if (baseTier !== 'TIER_1') return baseTier

  // AllergyIntolerance is always Tier 1 regardless of status
  if (resourceType === 'AllergyIntolerance') return 'TIER_1'

  // MedicationRequest: only active prescriptions are Tier 1
  if (resourceType === 'MedicationRequest') {
    return data.status === 'active' ? 'TIER_1' : 'TIER_2'
  }

  // Condition: only active conditions are Tier 1
  if (resourceType === 'Condition') {
    const raw = data.clinicalStatus

    // Plain string shorthand (non-FHIR-compliant but supported)
    if (typeof raw === 'string') {
      return raw === 'active' ? 'TIER_1' : 'TIER_2'
    }

    // FHIR CodeableConcept structure
    if (typeof raw === 'object' && raw !== null) {
      const concept = raw as Record<string, unknown>

      // Check coding array first (preferred FHIR path)
      if (Array.isArray(concept.coding)) {
        const hasActive = concept.coding.some(
          (c: Record<string, unknown>) => c.code === 'active',
        )
        return hasActive ? 'TIER_1' : 'TIER_2'
      }

      // Fallback: CodeableConcept with text only (no coding array)
      if (typeof concept.text === 'string') {
        return concept.text === 'active' ? 'TIER_1' : 'TIER_2'
      }
    }

    // Missing or unrecognized clinicalStatus — err on the side of safety
    return 'TIER_1'
  }

  return baseTier
}

/**
 * Check if two timestamps fall within the 60-second conflict window.
 */
function isWithinConflictWindow(a: HlcTimestamp, b: HlcTimestamp): boolean {
  return Math.abs(a.wallMs - b.wallMs) <= CONFLICT_WINDOW_MS
}

/**
 * Determine the winner between local and remote based on HLC comparison.
 * Returns 'local' or 'remote'.
 */
function determineWinner(local: SyncRecord, remote: SyncRecord): 'local' | 'remote' {
  const cmp = compareHlc(local.hlcTimestamp, remote.hlcTimestamp)
  // If timestamps are exactly equal, compareHlc breaks ties by nodeId
  return cmp >= 0 ? 'local' : 'remote'
}

/**
 * Resolve a conflict between two divergent versions of a resource.
 *
 * This is a pure function — deterministic, no I/O, no side effects.
 * The caller (sync worker) is responsible for persisting the resolution.
 */
export function resolveConflict(
  local: SyncRecord,
  remote: SyncRecord,
  resourceType: string,
): ConflictResolution {
  // Use the more recent data to determine effective tier (check both sides)
  const localTier = getEffectiveTier(resourceType, local.data)
  const remoteTier = getEffectiveTier(resourceType, remote.data)
  // Use the higher-safety tier (lower tier number = higher safety)
  const tier = higherSafetyTier(localTier, remoteTier)

  const withinWindow = isWithinConflictWindow(local.hlcTimestamp, remote.hlcTimestamp)

  switch (tier) {
    case 'TIER_1':
      return resolveTier1(local, remote, withinWindow)
    case 'TIER_2':
      return resolveTier2(local, remote, withinWindow)
    case 'TIER_3':
      return resolveTier3(local, remote, withinWindow)
    case 'CONSENT':
      return resolveConsent(local, remote, withinWindow)
    case 'QUEUE':
      return resolveQueue(local, remote, withinWindow)
  }
}

/** Tier priority: TIER_1 > CONSENT > TIER_2 > QUEUE > TIER_3. */
const TIER_PRIORITY: Record<ConflictTier, number> = {
  TIER_1: 0,
  CONSENT: 1,
  TIER_2: 2,
  QUEUE: 3,
  TIER_3: 4,
}

function higherSafetyTier(a: ConflictTier, b: ConflictTier): ConflictTier {
  return TIER_PRIORITY[a]! <= TIER_PRIORITY[b]! ? a : b
}

/**
 * Tier 1 — Safety-Critical (Append-Only)
 * Both versions kept. Conflict flagged for physician review.
 * Prescription generation blocked until resolved.
 */
function resolveTier1(
  local: SyncRecord,
  remote: SyncRecord,
  _withinWindow: boolean,
): ConflictResolution {
  return {
    strategy: 'APPEND_ONLY',
    kept: [local, remote],
    conflictFlag: true,
    blocksPrescription: true,
  }
}

/**
 * Tier 2 — Clinical (Timestamp-Based)
 * Newer HLC wins. Both versions kept as addenda.
 */
function resolveTier2(
  local: SyncRecord,
  remote: SyncRecord,
  withinWindow: boolean,
): ConflictResolution {
  const winner = determineWinner(local, remote)
  return {
    strategy: 'TIMESTAMP_WINS',
    winner,
    kept: [local, remote],
    conflictFlag: withinWindow,
    blocksPrescription: false,
  }
}

/**
 * Tier 3 — Operational (Last-Write-Wins)
 * Newer HLC replaces loser entirely. Only winner kept.
 */
function resolveTier3(
  local: SyncRecord,
  remote: SyncRecord,
  withinWindow: boolean,
): ConflictResolution {
  const winner = determineWinner(local, remote)
  const winnerRecord = winner === 'local' ? local : remote
  return {
    strategy: 'LWW',
    winner,
    kept: [winnerRecord],
    conflictFlag: withinWindow,
    blocksPrescription: false,
  }
}

/**
 * Consent — Append-Only Ledger
 * Same as Tier 1 but does not block prescription generation.
 */
function resolveConsent(
  local: SyncRecord,
  remote: SyncRecord,
  _withinWindow: boolean,
): ConflictResolution {
  return {
    strategy: 'APPEND_ONLY',
    kept: [local, remote],
    conflictFlag: true,
    blocksPrescription: false,
  }
}

/**
 * Queue — Chronological replay with 60-second conflict window.
 * Uses timestamp-based resolution. Events within 60s are flagged.
 *
 * NOTE: No resource type currently maps to QUEUE in CONFLICT_TIER_MAP.
 * Queue events are not standard FHIR resources — Story 9.2 (Background
 * Sync Worker) will route multi-device offline events here directly.
 */
function resolveQueue(
  local: SyncRecord,
  remote: SyncRecord,
  withinWindow: boolean,
): ConflictResolution {
  const winner = determineWinner(local, remote)
  return {
    strategy: 'TIMESTAMP_WINS',
    winner,
    kept: [local, remote],
    conflictFlag: withinWindow,
    blocksPrescription: false,
  }
}
