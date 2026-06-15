/**
 * Reference Lab Configuration Service — Story 54.4 / Task 3
 *
 * Manages the configurable list of reference labs available for send-outs.
 * Only lab_manager and lab_supervisor roles may mutate this configuration.
 * All mutations emit audit events via @ultranos/audit-logger.
 *
 * No PHI involved — reference labs are institutional records only.
 */

import { v4 as uuidv4 } from 'uuid'
import { getDb, putReferenceLab, getActiveReferenceLabs } from './db'
import { hlc, serializeHlc } from './hlc'
import { reportSendOutAuditEvent } from './audit-client'
import type { ReferenceLab, CreateRefLabInput } from '@/types/reference-lab'

/** Create and persist a new reference lab. Emits REFERENCE_LAB_CONFIGURED audit event. */
export async function addReferenceLab(
  input: CreateRefLabInput,
  actorId: string,
): Promise<ReferenceLab> {
  const now = new Date().toISOString()
  const lab: ReferenceLab = {
    id: uuidv4(),
    name: input.name,
    accreditationNumber: input.accreditationNumber,
    address: input.address,
    contactPhone: input.contactPhone,
    contactEmail: input.contactEmail,
    supportedTests: input.supportedTests,
    averageTATDays: input.averageTATDays,
    isActive: true,
    meta: { lastUpdated: now, versionId: '1' },
    _ultranos: { createdAt: now, hlcTimestamp: serializeHlc(hlc.now()) },
  }

  await putReferenceLab(lab)

  reportSendOutAuditEvent({
    action: 'REFERENCE_LAB_CONFIGURED',
    referenceLabId: lab.id,
    actorId,
    timestamp: now,
  })

  return lab
}

/** Update a reference lab record. Emits REFERENCE_LAB_CONFIGURED audit event. */
export async function updateReferenceLab(
  id: string,
  updates: Partial<Omit<ReferenceLab, 'id' | 'meta' | '_ultranos'>>,
  actorId: string,
): Promise<ReferenceLab> {
  const db = getDb()
  const existing = await db.reference_labs.get(id)
  if (!existing) throw new Error(`Reference lab not found: ${id}`)

  const now = new Date().toISOString()
  const updated: ReferenceLab = {
    ...existing,
    ...updates,
    meta: {
      lastUpdated: now,
      versionId: String(Number(existing.meta.versionId) + 1),
    },
    _ultranos: {
      ...existing._ultranos,
      hlcTimestamp: serializeHlc(hlc.now()),
    },
  }

  await putReferenceLab(updated)

  reportSendOutAuditEvent({
    action: 'REFERENCE_LAB_CONFIGURED',
    referenceLabId: id,
    actorId,
    timestamp: now,
  })

  return updated
}

/** Soft-deactivate a reference lab. Emits REFERENCE_LAB_CONFIGURED audit event. */
export async function deactivateReferenceLab(id: string, actorId: string): Promise<void> {
  await updateReferenceLab(id, { isActive: false }, actorId)
}

/**
 * Return active reference labs that support a specific LOINC test code.
 * Used to populate the reference lab selector in SendOutModal.
 */
export async function getLabsForTest(loincCode: string): Promise<ReferenceLab[]> {
  const labs = await getActiveReferenceLabs()
  return labs.filter((lab) => lab.supportedTests.includes(loincCode))
}
