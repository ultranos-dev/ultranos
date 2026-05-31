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
import { auditPhiAccess, AuditAction } from './audit'
import type { AuditResourceType } from './audit'
import type { FhirPatient, PatientAddress, PatientTier } from '@ultranos/shared-types'

const HUB_BASE_URL = process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'

/**
 * Transform a flat camelCase patient row from the Hub into the nested
 * FhirPatient shape expected by client components.
 *
 * The Hub stores patient data as flat Postgres columns (snake_case),
 * which are converted to flat camelCase by db.fromRows(). The client
 * expects FhirPatient with a nested `_ultranos` extension block.
 */
function toFhirPatient(row: Record<string, unknown>): FhirPatient {
  // If already in FhirPatient shape (e.g. stored by registration), return as-is
  if (row._ultranos && typeof row._ultranos === 'object') {
    return row as unknown as FhirPatient
  }

  const addressOrigin: PatientAddress | undefined =
    row.addressProvinceOrigin
      ? {
          province: row.addressProvinceOrigin as PatientAddress['province'],
          district: (row.addressDistrictOrigin as string) ?? '',
          village: (row.addressVillageOrigin as string) || undefined,
        }
      : undefined

  const addressCurrent: PatientAddress | undefined =
    row.addressProvinceCurrent
      ? {
          province: row.addressProvinceCurrent as PatientAddress['province'],
          district: (row.addressDistrictCurrent as string) ?? '',
          village: (row.addressVillageCurrent as string) || undefined,
        }
      : undefined

  const phone = (row.telecomPhone as string) || undefined

  return {
    id: row.id as string,
    resourceType: 'Patient',
    name: [
      {
        given: row.nameGiven ? [row.nameGiven as string] : [],
        text: (row.nameLocal as string) ?? '',
      },
    ],
    gender: row.gender as FhirPatient['gender'],
    birthDate: (row.birthDate as string) || undefined,
    birthYearOnly: (row.birthYearOnly as boolean) ?? true,
    telecom: phone ? [{ system: 'phone', value: phone }] : [],
    _ultranos: {
      nameLocal: (row.nameLocalEnc as string) ?? (row.nameLocal as string) ?? '',
      nameLatin: (row.nameLatinEnc as string) ?? (row.nameLatin as string) ?? undefined,
      namePhonetic: (row.namePhoneticEnc as string) ?? (row.namePhonetic as string) ?? undefined,
      nationalIdHash: (row.nationalIdHash as string) ?? undefined,
      guardianId: (row.guardianId as string) ?? undefined,
      consentVersion: (row.consentVersion as string) ?? undefined,
      patient_tier: ((row.patientTier as string) ?? 'FREE') as PatientTier,
      preferredLanguage: (row.preferredLanguage as string) ?? undefined,
      isActive: (row.isActive as boolean) ?? true,
      createdBy: (row.createdBy as string) ?? undefined,
      createdAt: (row.createdAt as string) ?? new Date().toISOString(),
      nameGiven: (row.nameGivenEnc as string) ?? (row.nameGiven as string) ?? undefined,
      nameFather: (row.nameFatherEnc as string) ?? (row.nameFather as string) ?? undefined,
      nameGrandfather: (row.nameGrandfatherEnc as string) ?? (row.nameGrandfather as string) ?? undefined,
      birthYear: (row.birthYear as number) ?? undefined,
      addressOrigin,
      addressCurrent,
      isNomadic: (row.isNomadic as boolean) ?? false,
      biometricFingerprintHash: (row.biometricFingerprintHash as string) ?? undefined,
      biometricAlgorithmVersion: (row.biometricAlgorithmVersion as string) ?? undefined,
      mpiScore: (row.mpiScore as number) ?? undefined,
      identifiers: (row.identifiers as FhirPatient['_ultranos']['identifiers']) ?? undefined,
      photoUrl: (row.photoUrl as string) ?? undefined,
      bloodGroup: (row.bloodGroup as string) ?? undefined,
    },
    meta: {
      lastUpdated: (row.updatedAt as string) ?? (row.meta as Record<string, unknown>)?.lastUpdated as string ?? new Date().toISOString(),
      versionId: (row.metaVersionId as string) ?? (row.meta as Record<string, unknown>)?.versionId as string ?? undefined,
    },
  }
}

/**
 * Transform resource data from Hub format to the FHIR shape expected
 * by client components, based on resource type.
 */
function transformResourceData(
  resourceType: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (resourceType === 'Patient') {
    return toFhirPatient(data) as unknown as Record<string, unknown>
  }
  return data
}

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
  const res = await fetch(`${HUB_BASE_URL}/sync.pull?input=${params}`, {
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
      const table = (db as unknown as Record<string, { get: (key: string) => Promise<unknown>; put: (item: unknown) => Promise<unknown> }>)[tableName]
      if (!table) {
        result.errors.push(`No local table for: ${tableName}`)
        continue
      }
      const localRecord = await table.get(change.resourceId)

      const transformedData = transformResourceData(change.resourceType, change.data)

      if (!localRecord) {
        // No local version — straight insert
        await table.put({ ...transformedData, id: change.resourceId })
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
          data: transformedData,
          hlcTimestamp: remoteHlc,
          version: (transformedData.meta as Record<string, unknown>)?.versionId as string ?? '1',
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
          const winner = resolution.winner === 'remote' ? transformedData : localRecord
          await table.put({ ...winner as Record<string, unknown>, id: change.resourceId })
        } else if (resolution.strategy === 'TIMESTAMP_WINS') {
          // Tier 2: winner is primary, loser kept as addendum
          const winner = resolution.winner === 'remote' ? transformedData : localRecord
          await table.put({ ...winner as Record<string, unknown>, id: change.resourceId })
        } else if (resolution.strategy === 'APPEND_ONLY') {
          // Tier 1/Consent: both versions kept — remote gets a new ID
          await table.put({ ...transformedData, id: `${change.resourceId}-remote-${Date.now()}` })
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
