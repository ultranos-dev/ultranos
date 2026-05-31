/**
 * Employee Health Record Service — Story 47.3
 *
 * CRUD operations for encrypted employee health records in Dexie.
 * All operations enforce access control and emit audit events.
 * Clinical data is encrypted at rest; only id/practitionerId/lastUpdated are cleartext.
 */

import type {
  EmployeeHealthRecord,
  ExposureHistoryEntry,
  VaccinationStatus,
} from '@/types/employee-health'
import {
  HepBImmunityStatus,
  TbScreeningResult,
  VaccinationStatus as VS,
} from '@/types/employee-health'
import { encryptHealthRecord, decryptHealthRecord } from './health-record-crypto'
import { assertHealthRecordAccess } from './health-record-access'
import { reportHealthRecordAuditEvent } from '@/lib/audit-client'
import { getDb, enqueueSyncEvent } from '@/lib/db'
import { getSessionEncryptionKey } from '@/lib/consent-crypto'
import { hlc, serializeHlc } from '@/lib/hlc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

function getCurrentUser() {
  const session = useAuthSessionStore.getState().session
  if (!session) throw new Error('No active session')
  return session
}

/**
 * Create a new health record for a practitioner.
 * Access: self or LAB_MANAGER.
 */
export async function createHealthRecord(
  practitionerId: string,
  data: Partial<EmployeeHealthRecord>,
): Promise<EmployeeHealthRecord> {
  const user = getCurrentUser()
  assertHealthRecordAccess(user.practitionerId, user.labRole, practitionerId)

  const now = new Date().toISOString()
  const record: EmployeeHealthRecord = {
    id: crypto.randomUUID(),
    practitionerId,
    hepBStatus: data.hepBStatus ?? VS.UNKNOWN,
    hepBDoses: data.hepBDoses ?? 0,
    hepBTiterDate: data.hepBTiterDate ?? null,
    hepBTiterResult: data.hepBTiterResult ?? HepBImmunityStatus.UNKNOWN,
    tetanusDate: data.tetanusDate ?? null,
    tetanusStatus: data.tetanusStatus ?? VS.UNKNOWN,
    covidDate: data.covidDate ?? null,
    covidStatus: data.covidStatus ?? VS.UNKNOWN,
    covidDoses: data.covidDoses ?? 0,
    tbScreeningDate: data.tbScreeningDate ?? null,
    tbScreeningResult: data.tbScreeningResult ?? TbScreeningResult.NOT_DONE,
    tbScreeningHistory: data.tbScreeningHistory ?? [],
    exposureHistory: data.exposureHistory ?? [],
    notes: data.notes ?? '',
    lastUpdated: now,
    updatedBy: user.practitionerId,
    hlcTimestamp: serializeHlc(hlc.now()),
  }

  const key = await getSessionEncryptionKey()
  const encrypted = await encryptHealthRecord(record, key)
  const db = getDb()
  await db.employee_health_records.put(encrypted)

  reportHealthRecordAuditEvent({
    action: 'HEALTH_RECORD_CREATED',
    practitionerId,
    accessedBy: user.practitionerId,
    fieldsModified: Object.keys(data),
  })

  await enqueueSyncEvent({
    resourceType: 'EmployeeHealthRecord',
    resourceId: record.id,
    payload: encrypted,
    hlcTimestamp: record.hlcTimestamp,
  })

  return record
}

/**
 * Update an existing health record.
 * Decrypts, applies updates, re-encrypts, persists.
 * Access: self or LAB_MANAGER.
 */
export async function updateHealthRecord(
  practitionerId: string,
  updates: Partial<EmployeeHealthRecord>,
): Promise<EmployeeHealthRecord> {
  const user = getCurrentUser()
  assertHealthRecordAccess(user.practitionerId, user.labRole, practitionerId)

  const key = await getSessionEncryptionKey()
  const db = getDb()
  const existing = await db.employee_health_records
    .where('practitionerId')
    .equals(practitionerId)
    .first()

  if (!existing) {
    throw new Error('Health record not found')
  }

  const decrypted = await decryptHealthRecord(existing, key)
  const now = new Date().toISOString()
  const updated: EmployeeHealthRecord = {
    ...decrypted,
    ...updates,
    id: decrypted.id,
    practitionerId: decrypted.practitionerId,
    lastUpdated: now,
    updatedBy: user.practitionerId,
    hlcTimestamp: serializeHlc(hlc.now()),
  }

  const encrypted = await encryptHealthRecord(updated, key)
  await db.employee_health_records.put(encrypted)

  const modifiedFields = Object.keys(updates).filter(
    (k) => k !== 'id' && k !== 'practitionerId',
  )
  reportHealthRecordAuditEvent({
    action: 'HEALTH_RECORD_UPDATED',
    practitionerId,
    accessedBy: user.practitionerId,
    fieldsModified: modifiedFields,
  })

  await enqueueSyncEvent({
    resourceType: 'EmployeeHealthRecord',
    resourceId: updated.id,
    payload: encrypted,
    hlcTimestamp: updated.hlcTimestamp,
  })

  return updated
}

/**
 * Get a practitioner's health record.
 * Access-controlled read with decryption.
 */
export async function getHealthRecord(
  practitionerId: string,
): Promise<EmployeeHealthRecord | null> {
  const user = getCurrentUser()
  assertHealthRecordAccess(user.practitionerId, user.labRole, practitionerId)

  const db = getDb()
  const encrypted = await db.employee_health_records
    .where('practitionerId')
    .equals(practitionerId)
    .first()

  if (!encrypted) return null

  const key = await getSessionEncryptionKey()
  const record = await decryptHealthRecord(encrypted, key)

  reportHealthRecordAuditEvent({
    action: 'HEALTH_RECORD_ACCESSED',
    practitionerId,
    accessedBy: user.practitionerId,
    fieldsModified: [],
  })

  return record
}

/**
 * Fast vaccination status lookup for exposure protocol (Story 47.1 integration).
 * Returns only PEP-relevant fields. Self-access is always permitted during emergencies.
 */
export async function getVaccinationStatusForExposure(
  practitionerId: string,
): Promise<{
  hepBImmune: boolean
  hepBStatus: VaccinationStatus
  tetanusCurrent: boolean
  lastTbScreening: string | null
}> {
  const user = getCurrentUser()
  assertHealthRecordAccess(user.practitionerId, user.labRole, practitionerId)

  const db = getDb()
  const encrypted = await db.employee_health_records
    .where('practitionerId')
    .equals(practitionerId)
    .first()

  if (!encrypted) {
    return {
      hepBImmune: false,
      hepBStatus: VS.UNKNOWN,
      tetanusCurrent: false,
      lastTbScreening: null,
    }
  }

  const key = await getSessionEncryptionKey()
  const record = await decryptHealthRecord(encrypted, key)

  // Tetanus is current if last dose was within 10 years
  const tetanusCurrent = record.tetanusDate
    ? daysBetween(record.tetanusDate, new Date().toISOString()) < 3650
    : false

  reportHealthRecordAuditEvent({
    action: 'HEALTH_RECORD_ACCESSED',
    practitionerId,
    accessedBy: user.practitionerId,
    fieldsModified: [],
  })

  return {
    hepBImmune: record.hepBTiterResult === HepBImmunityStatus.IMMUNE,
    hepBStatus: record.hepBStatus,
    tetanusCurrent,
    lastTbScreening: record.tbScreeningDate,
  }
}

/**
 * Append an exposure event to a practitioner's history.
 * Append-only — Tier 1 philosophy.
 */
export async function addExposureToHistory(
  practitionerId: string,
  entry: ExposureHistoryEntry,
): Promise<void> {
  const user = getCurrentUser()
  assertHealthRecordAccess(user.practitionerId, user.labRole, practitionerId)

  const key = await getSessionEncryptionKey()
  const db = getDb()
  const existing = await db.employee_health_records
    .where('practitionerId')
    .equals(practitionerId)
    .first()

  if (!existing) {
    throw new Error('Health record not found')
  }

  const decrypted = await decryptHealthRecord(existing, key)
  const now = new Date().toISOString()
  const updated: EmployeeHealthRecord = {
    ...decrypted,
    exposureHistory: [...decrypted.exposureHistory, entry],
    lastUpdated: now,
    updatedBy: user.practitionerId,
    hlcTimestamp: serializeHlc(hlc.now()),
  }

  const encrypted = await encryptHealthRecord(updated, key)
  await db.employee_health_records.put(encrypted)

  reportHealthRecordAuditEvent({
    action: 'EXPOSURE_HISTORY_ADDED',
    practitionerId,
    accessedBy: user.practitionerId,
    fieldsModified: ['exposureHistory'],
  })

  await enqueueSyncEvent({
    resourceType: 'EmployeeHealthRecord',
    resourceId: updated.id,
    payload: encrypted,
    hlcTimestamp: updated.hlcTimestamp,
  })
}

/** Calculate days between two ISO date strings. */
function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime()
  const b = new Date(dateB).getTime()
  return Math.abs(b - a) / (1000 * 60 * 60 * 24)
}
