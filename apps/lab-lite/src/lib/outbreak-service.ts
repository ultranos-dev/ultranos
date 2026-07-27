/**
 * Outbreak Response Mode service — Story 54.5
 *
 * Manages the lifecycle of outbreak mode: activation, deactivation, queue
 * priority calculation, and inventory recalibration.
 *
 * Role authorization: health_officer OR lab_supervisor (LabRole.SUPERVISOR / LAB_MANAGER).
 * No PHI in any function — all identifiers are opaque (CLAUDE.md Rule #1).
 */

import { LabRole } from '@ultranos/shared-types'
import { hlc, serializeHlc } from './hlc'
import { putOutbreakConfig, getActiveOutbreak, getDb } from './db'
import type { FhirSpecimen } from '@ultranos/shared-types'
import type {
  OutbreakModeConfig,
  ActivateOutbreakInput,
  OutbreakQueuePriority,
} from '@/types/outbreak'

// ---------------------------------------------------------------------------
// Role authorization
// ---------------------------------------------------------------------------

/**
 * Roles authorized to activate or deactivate Outbreak Mode.
 * Matches story AC #2: health_officer or lab_supervisor.
 *
 * In the Ultranos system:
 *   - health_officer → session.role === 'HEALTH_OFFICER' (external health authority)
 *   - lab_supervisor → session.labRole in [SUPERVISOR, LAB_MANAGER]
 */
const AUTHORIZED_LAB_ROLES: ReadonlySet<LabRole> = new Set([
  LabRole.SUPERVISOR,
  LabRole.LAB_MANAGER,
])

export interface OutbreakAuthContext {
  actorId: string
  actorRole: string        // UserRole string
  actorLabRole: LabRole | null
}

export class OutbreakAuthorizationError extends Error {
  constructor(actorId: string) {
    super(`Actor ${actorId} is not authorized to manage Outbreak Mode`)
    this.name = 'OutbreakAuthorizationError'
  }
}

export function isOutbreakAuthorized(ctx: OutbreakAuthContext): boolean {
  if (ctx.actorRole === 'HEALTH_OFFICER') return true
  if (ctx.actorLabRole && AUTHORIZED_LAB_ROLES.has(ctx.actorLabRole)) return true
  return false
}

function assertAuthorized(ctx: OutbreakAuthContext): void {
  if (!isOutbreakAuthorized(ctx)) {
    throw new OutbreakAuthorizationError(ctx.actorId)
  }
}

// ---------------------------------------------------------------------------
// In-memory cache for active outbreak
// Checked on every page render for banner display — avoids repeated DB hits.
// ---------------------------------------------------------------------------

let _cachedActiveOutbreak: OutbreakModeConfig | null | undefined = undefined

function invalidateCache(): void {
  _cachedActiveOutbreak = undefined
}

// ---------------------------------------------------------------------------
// Core service functions
// ---------------------------------------------------------------------------

/**
 * Activate Outbreak Mode for the given scope and pathogen.
 *
 * Validates role authorization, creates the config record, persists to Dexie,
 * and invalidates the in-memory cache.
 *
 * Callers must emit the OUTBREAK_MODE_ACTIVATED audit event after this resolves.
 */
export async function activateOutbreakMode(
  input: ActivateOutbreakInput,
  authCtx: OutbreakAuthContext,
): Promise<OutbreakModeConfig> {
  assertAuthorized(authCtx)

  // Guard: refuse if another outbreak is already active
  const existing = await getActiveOutbreak()
  if (existing) {
    throw new Error(
      `Outbreak Mode is already active (configId: ${existing.id}). Deactivate it first.`,
    )
  }

  const now = serializeHlc(hlc.now())
  const isoNow = new Date().toISOString()

  const config: OutbreakModeConfig = {
    id: crypto.randomUUID(),
    status: 'active',
    activatedBy: input.activatedBy,
    activatedAt: now,
    deactivatedBy: null,
    deactivatedAt: null,
    targetPathogen: input.targetPathogen,
    targetTestCodes: input.targetTestCodes,
    affectedScope: input.affectedScope,
    activationReason: input.activationReason,
    surgeMultiplier: input.surgeMultiplier ?? 3,
    meta: {
      lastUpdated: isoNow,
      versionId: '1',
    },
    _ultranos: {
      createdAt: isoNow,
      hlcTimestamp: now,
    },
  }

  await putOutbreakConfig(config)
  invalidateCache()
  return config
}

/**
 * Deactivate Outbreak Mode, recording who deactivated and when.
 *
 * Validates role authorization, updates the config record, persists to Dexie,
 * and invalidates the in-memory cache.
 *
 * Callers must:
 * 1. Call generateDailySitrep() to produce a final closing sitrep.
 * 2. Call restoreNormalOperations() to revert queue/reporting/inventory settings.
 * 3. Emit the OUTBREAK_MODE_DEACTIVATED audit event.
 */
export async function deactivateOutbreakMode(
  configId: string,
  authCtx: OutbreakAuthContext,
): Promise<OutbreakModeConfig> {
  assertAuthorized(authCtx)

  const db = getDb()
  const config = await db.outbreak_configs.get(configId)
  if (!config) {
    throw new Error(`Outbreak config not found: ${configId}`)
  }
  if (config.status === 'inactive') {
    throw new Error(`Outbreak config ${configId} is already inactive`)
  }

  const now = serializeHlc(hlc.now())
  const isoNow = new Date().toISOString()

  const updated: OutbreakModeConfig = {
    ...config,
    status: 'inactive',
    deactivatedBy: authCtx.actorId,
    deactivatedAt: now,
    meta: {
      lastUpdated: isoNow,
      versionId: String(Number(config.meta.versionId) + 1),
    },
    _ultranos: {
      ...config._ultranos,
      hlcTimestamp: now,
    },
  }

  await putOutbreakConfig(updated)
  invalidateCache()
  return updated
}

/**
 * Return the active outbreak config, or null.
 * Uses an in-memory cache to avoid repeated Dexie reads on every page render.
 */
export async function isOutbreakModeActive(): Promise<OutbreakModeConfig | null> {
  if (_cachedActiveOutbreak !== undefined) {
    return _cachedActiveOutbreak
  }
  const result = await getActiveOutbreak()
  _cachedActiveOutbreak = result
  return result
}

/**
 * Compute the queue priority for a given specimen under the current outbreak config.
 *
 * Returns isOutbreakPriority=true if:
 * - An outbreak is active, AND
 * - The specimen's service request includes one of the target test codes.
 *
 * The caller is responsible for fetching the active outbreak config first
 * (or passing it in) to avoid N+1 Dexie calls per queue item.
 */
export function getOutbreakQueuePriority(
  sample: FhirSpecimen,
  activeOutbreak: OutbreakModeConfig | null,
): OutbreakQueuePriority {
  if (!activeOutbreak) {
    return { isOutbreakPriority: false, priorityLevel: 0, outbreakConfigId: null }
  }

  // Check if any of the sample's test requests match the outbreak target codes.
  // FhirSpecimen may have type.coding array with LOINC codes.
  const sampleCodes: string[] = []

  if (sample.type?.coding) {
    for (const coding of sample.type.coding) {
      if (coding.code) sampleCodes.push(coding.code)
    }
  }

  // Also check _ultranos extension for explicit test codes (set during accessioning)
  const ultranos = sample._ultranos as Record<string, unknown> | undefined
  if (ultranos?.testLoincCode && typeof ultranos.testLoincCode === 'string') {
    sampleCodes.push(ultranos.testLoincCode)
  }

  const isOutbreakPriority = sampleCodes.some((code) =>
    activeOutbreak.targetTestCodes.includes(code),
  )

  return {
    isOutbreakPriority,
    priorityLevel: isOutbreakPriority ? 100 : 0,
    outbreakConfigId: isOutbreakPriority ? activeOutbreak.id : null,
  }
}

/**
 * Recalibrate inventory alert thresholds for surge demand.
 *
 * Applies surgeMultiplier to the daily consumption rate of all reagents
 * linked to the target test codes. This gives early warning of stockouts
 * during a surge. Integrates with Story 48.2 predictive burndown if available,
 * otherwise uses simple multiplication.
 *
 * No PHI — reagent IDs and consumption rates are purely operational.
 */
export async function recalibrateInventoryAlerts(
  targetTestCodes: string[],
  surgeMultiplier: number,
): Promise<void> {
  const db = getDb()

  // Get all reagents linked to the target test codes
  const reagents = await db.reagent_inventory
    .where('linkedTestCode')
    .anyOf(targetTestCodes)
    .toArray()

  if (reagents.length === 0) return

  // Apply surge multiplier by writing a sentinel field to each reagent.
  // The surge projection itself is computed in surge-inventory.ts.
  // Here we only store the effective multiplier so the burndown service
  // picks it up when computing the next alert.
  for (const reagent of reagents) {
    if (reagent.id == null) continue
    await db.reagent_inventory.update(reagent.id, {
      // @ts-expect-error — surgeMultiplier is a Story 54.5 extension field
      surgeMultiplier,
    })
  }
}

/**
 * Restore normal inventory alert thresholds after Outbreak Mode deactivation.
 * Removes the surge multiplier from all reagents linked to the target test codes.
 */
export async function restoreNormalOperations(targetTestCodes: string[]): Promise<void> {
  const db = getDb()
  const reagents = await db.reagent_inventory
    .where('linkedTestCode')
    .anyOf(targetTestCodes)
    .toArray()

  for (const reagent of reagents) {
    if (reagent.id == null) continue
    await db.reagent_inventory.update(reagent.id, {
      // @ts-expect-error — surgeMultiplier is a Story 54.5 extension field
      surgeMultiplier: undefined,
    })
  }
}

/** Expose cache invalidation for testing. */
export function _invalidateOutbreakCache(): void {
  invalidateCache()
}
