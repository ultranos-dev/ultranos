/**
 * Pull patient changes from Hub and apply to local Dexie tables.
 *
 * Uses the sync.pull tRPC endpoint with incremental HLC watermarks.
 * Applies conflict resolution per tier before writing to IndexedDB.
 */

import { db } from './db'
import { hlc } from './hlc'
import {
  resolveConflict,
  deserializeHlc,
  compareHlc,
  type SyncRecord,
} from '@ultranos/sync-engine'
import { auditPhiAccess, AuditAction, AuditResourceType } from './audit'

const HUB_BASE_URL = process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000'

/** Maps FHIR resourceType to the Dexie table name for local storage. */
const RESOURCE_TABLE_MAP: Record<string, string> = {
  Patient: 'patients',
  Encounter: 'encounters',
  ClinicalImpression: 'soapLedger',
  Observation: 'observations',
  Condition: 'conditions',
  MedicationRequest: 'medications',
  AllergyIntolerance: 'allergyIntolerances',
  MedicationStatement: 'medicationStatements',
}

export interface PullResult {
  changesApplied: number
  conflictsDetected: number
  errors: string[]
}

/**
 * Pull all changes for a patient from the Hub since the last known HLC.
 * Applies changes to the appropriate Dexie tables with tier-based conflict resolution.
 */
export async function pullPatientChanges(
  patientId: string,
  getAuthToken: () => string,
): Promise<PullResult> {
  const result: PullResult = { changesApplied: 0, conflictsDetected: 0, errors: [] }

  // 1. Look up the last-known HLC watermark for this patient
  const meta = await db.syncMeta.get(patientId)
  const sinceHlc = meta?.lastPulledHlc ?? '0'

  // 2. Call sync.pull via tRPC
  const token = getAuthToken()
  const params = encodeURIComponent(JSON.stringify({ json: { patientId, sinceHlc } }))
  const res = await fetch(`${HUB_BASE_URL}/api/trpc/sync.pull?input=${params}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    result.errors.push(`Pull failed: HTTP ${res.status}`)
    return result
  }

  const data = await res.json() as {
    result: { data: { json: { changes: Array<{
      resourceType: string
      resourceId: string
      data: Record<string, unknown>
      hlcTimestamp: string
    }> } } }
  }

  const changes = data.result?.data?.json?.changes
  if (!changes || changes.length === 0) {
    // No changes — update the watermark timestamp only
    await db.syncMeta.put({
      patientId,
      lastPulledHlc: sinceHlc,
      lastPulledAt: new Date().toISOString(),
    })
    return result
  }

  // 3. Apply each change to the local Dexie table
  let highestHlc = sinceHlc

  for (const change of changes) {
    const tableName = RESOURCE_TABLE_MAP[change.resourceType]
    if (!tableName) {
      result.errors.push(`Unknown resourceType: ${change.resourceType}`)
      continue
    }

    try {
      const table = (db as Record<string, unknown>)[tableName] as import('dexie').Table
      const localRecord = await table.get(change.resourceId)

      if (!localRecord) {
        // No local version — straight insert
        await table.put({ ...change.data, id: change.resourceId })
        result.changesApplied++
      } else {
        // Local record exists — run conflict resolution
        const localHlc = (localRecord as Record<string, unknown>)._ultranos
          ? deserializeHlc(((localRecord as Record<string, unknown>)._ultranos as Record<string, unknown>).hlcTimestamp as string)
          : deserializeHlc('0')
        const remoteHlc = deserializeHlc(change.hlcTimestamp)

        // Skip if we already have the same or newer version
        if (compareHlc(localHlc, remoteHlc) >= 0) {
          continue
        }

        const localSyncRecord: SyncRecord = {
          id: change.resourceId,
          data: localRecord as Record<string, unknown>,
          hlcTimestamp: localHlc,
          version: ((localRecord as Record<string, unknown>).meta as Record<string, unknown>)?.versionId as string ?? '1',
        }
        const remoteSyncRecord: SyncRecord = {
          id: change.resourceId,
          data: change.data,
          hlcTimestamp: remoteHlc,
          version: (change.data.meta as Record<string, unknown>)?.versionId as string ?? '1',
        }

        const resolution = resolveConflict(localSyncRecord, remoteSyncRecord, change.resourceType)

        if (resolution.conflictFlag) {
          // Persist conflict for physician review
          result.conflictsDetected++
          await db.syncQueue.put({
            id: `pull-conflict-${change.resourceId}-${Date.now()}`,
            resourceType: change.resourceType,
            resourceId: change.resourceId,
            action: 'pull-conflict',
            payload: JSON.stringify(localRecord),
            status: 'failed',
            hlcTimestamp: change.hlcTimestamp,
            createdAt: new Date().toISOString(),
            retryCount: 0,
            conflictFlag: true,
            conflictData: JSON.stringify(change.data),
            patientRef: `Patient/${patientId}`,
          })
        }

        // Apply the winning version(s) to the table
        if (resolution.strategy === 'LWW') {
          // Tier 3: winner replaces
          const winner = resolution.winner === 'remote' ? change.data : localRecord
          await table.put({ ...winner as Record<string, unknown>, id: change.resourceId })
        } else if (resolution.strategy === 'TIMESTAMP_WINS') {
          // Tier 2: winner is primary, loser kept as addendum
          const winner = resolution.winner === 'remote' ? change.data : localRecord
          await table.put({ ...winner as Record<string, unknown>, id: change.resourceId })
        } else if (resolution.strategy === 'APPEND_ONLY') {
          // Tier 1/Consent: both versions kept — remote gets a new ID
          await table.put({ ...change.data, id: `${change.resourceId}-remote-${Date.now()}` })
        }

        result.changesApplied++
      }

      // Update HLC clock with remote timestamp for causal ordering
      hlc.receive(deserializeHlc(change.hlcTimestamp))

      // Track highest HLC for watermark update
      if (change.hlcTimestamp > highestHlc) {
        highestHlc = change.hlcTimestamp
      }

      // Audit each PHI read
      auditPhiAccess(
        AuditAction.READ,
        change.resourceType as AuditResourceType,
        change.resourceId,
        patientId,
        { source: 'sync-pull' },
      )
    } catch (err) {
      result.errors.push(`Failed to apply ${change.resourceType}/${change.resourceId}: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  // 4. Update the watermark
  await db.syncMeta.put({
    patientId,
    lastPulledHlc: highestHlc,
    lastPulledAt: new Date().toISOString(),
  })

  return result
}
