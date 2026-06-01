/**
 * Story 53.6 — AI Provenance Trail: Hash Chain Implementation
 *
 * SHA-256 hash chaining for AI provenance records using the Web Crypto API.
 * Each record's hash covers all chain-critical fields + the previous record's hash,
 * creating a tamper-evident chain.
 *
 * Design notes:
 * - Uses crypto.subtle.digest('SHA-256', ...) — available in all modern browsers
 *   and service workers. No additional crypto dependencies needed.
 * - Human decisions (techDecision, physicianConfirmation) and syncStatus are
 *   intentionally EXCLUDED from the hash — they are addenda tracked separately.
 * - The chain covers: all fields in AiProvenanceRecord except recordHash,
 *   syncStatus, techDecision, and physicianConfirmation.
 */

import { getDb } from './db'
import type { AiProvenanceRecord } from './ai-provenance'

// ---------------------------------------------------------------------------
// Hash computation
// ---------------------------------------------------------------------------

/**
 * Fields excluded from the hash computation.
 * recordHash: would be circular.
 * syncStatus: operational metadata, not chain-critical.
 * techDecision / physicianConfirmation: addenda, tracked by audit events.
 */
const EXCLUDED_FROM_HASH = new Set<keyof AiProvenanceRecord>([
  'recordHash',
  'syncStatus',
  'techDecision',
  'physicianConfirmation',
])

/**
 * Compute the SHA-256 hash for a provenance record.
 *
 * Serializes chain-critical fields to a canonical JSON string, prepends
 * the previousHash (or empty string for first record), and computes SHA-256.
 *
 * @param record - All fields except recordHash.
 * @param previousHash - Hash of prior record, or null for first record.
 * @returns Hex-encoded SHA-256 hash string (64 chars).
 */
export async function computeRecordHash(
  record: Omit<AiProvenanceRecord, 'recordHash'>,
  previousHash: string | null
): Promise<string> {
  // Build canonical object: only chain-critical fields, sorted by key
  const chainFields: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(record)) {
    if (!EXCLUDED_FROM_HASH.has(k as keyof AiProvenanceRecord)) {
      chainFields[k] = v
    }
  }

  const sortedKeys = Object.keys(chainFields).sort()
  const canonical: Record<string, unknown> = {}
  for (const k of sortedKeys) {
    canonical[k] = chainFields[k]
  }

  const payload = (previousHash ?? '') + JSON.stringify(canonical)
  return sha256Hex(payload)
}

// ---------------------------------------------------------------------------
// Chain state helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the recordHash of the most recently created provenance record,
 * for use as the previousHash of the next record.
 *
 * @returns The hash string, or null if no records exist yet.
 */
export async function getLastProvenanceHash(): Promise<string | null> {
  const db = getDb()
  const last = await db.ai_provenance.orderBy('timestamp').last()
  return last?.recordHash ?? null
}

// ---------------------------------------------------------------------------
// Chain verification
// ---------------------------------------------------------------------------

export interface ChainVerificationResult {
  valid: boolean
  checkedCount: number
  brokenAt?: string            // record id where chain breaks
  firstRecordTimestamp?: string
  lastRecordTimestamp?: string
}

/**
 * Re-compute SHA-256 hashes for all provenance records in a date range and
 * verify chain integrity.
 *
 * Verifies:
 * 1. Each record's recordHash matches the re-computed hash.
 * 2. Each record's previousHash matches the prior record's recordHash.
 *
 * @param startDate - ISO 8601 start (inclusive)
 * @param endDate   - ISO 8601 end (inclusive)
 */
export async function verifyProvenanceChain(
  startDate: string,
  endDate: string
): Promise<ChainVerificationResult> {
  const db = getDb()
  const records = await db.ai_provenance
    .where('timestamp')
    .between(startDate, endDate, true, true)
    .sortBy('timestamp') as AiProvenanceRecord[]

  if (records.length === 0) {
    return { valid: true, checkedCount: 0 }
  }

  const first = records[0]!
  const last = records[records.length - 1]!
  let previousHash: string | null = null

  for (const record of records) {
    // Verify previousHash chain linkage
    if (record.previousHash !== previousHash) {
      return {
        valid: false,
        checkedCount: records.indexOf(record),
        brokenAt: record.id,
        firstRecordTimestamp: first.timestamp,
        lastRecordTimestamp: last.timestamp,
      }
    }

    // Re-compute hash and compare
    const { recordHash: _omit, ...withoutRecordHash } = record as AiProvenanceRecord & { recordHash: string }
    void _omit // unused
    const recomputed = await computeRecordHash(
      withoutRecordHash as Omit<AiProvenanceRecord, 'recordHash'>,
      record.previousHash
    )

    if (recomputed !== record.recordHash) {
      return {
        valid: false,
        checkedCount: records.indexOf(record),
        brokenAt: record.id,
        firstRecordTimestamp: first.timestamp,
        lastRecordTimestamp: last.timestamp,
      }
    }

    previousHash = record.recordHash
  }

  return {
    valid: true,
    checkedCount: records.length,
    firstRecordTimestamp: first.timestamp,
    lastRecordTimestamp: last.timestamp,
  }
}

// ---------------------------------------------------------------------------
// Crypto helper
// ---------------------------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
