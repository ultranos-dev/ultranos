import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { AuditLogger } from '@ultranos/audit-logger'
import { db } from '@/lib/supabase'
import { compareHlc, deserializeHlc, resolveConflict } from '@ultranos/sync-engine'
import { flattenForDb } from '@/lib/resource-mappers'
import { encryptJsonbValue } from '@/lib/field-encryption'

const SyncOperationSchema = z.object({
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  action: z.enum(['create', 'update']),
  payload: z.string().min(1),
  hlcTimestamp: z.string().min(1),
})

/** Map FHIR resource types to Supabase table names. */
const RESOURCE_TABLE_MAP: Record<string, string> = {
  Encounter: 'encounters',
  ClinicalImpression: 'soap_ledger',
  Observation: 'observations',
  Condition: 'conditions',
  MedicationRequest: 'medication_requests',
  AllergyIntolerance: 'allergy_intolerances',
  MedicationStatement: 'medication_statements',
  Consent: 'consent_records',
  Patient: 'patients',
}

/**
 * Tables carrying a NOT NULL `org_id` (multi-tenant scoping). For these, the
 * Hub stamps org_id from the authenticated user's context — spokes never send
 * it. soap_ledger/patients/consent_records/allergy_intolerances have no org_id
 * column, so it must NOT be injected there (would be an unknown-column error).
 */
const ORG_SCOPED_TABLES = new Set<string>(['encounters', 'observations', 'conditions', 'medication_requests'])

/**
 * Tables with no `hlc_timestamp` column. The generic HLC-based pull (and push
 * conflict-detection) must skip these — consent_records syncs via its dedicated
 * append-only consent ledger path, not the generic HLC engine.
 */
const NO_HLC_TABLES = new Set<string>(['consent_records'])

/**
 * Concurrency window for Tier-1 conflict detection, in milliseconds.
 * Mirrors CONFLICT_WINDOW_MS in the sync-engine resolver and the PRD's 60s
 * conflict window (CLAUDE.md Tier 4). Two Tier-1 writes from different devices
 * within this window are treated as concurrent (divergent) rather than causal.
 */
const TIER1_CONFLICT_WINDOW_MS = 60_000

/**
 * Extract a patient reference (e.g. "Patient/<id>") from either a FHIR payload
 * (nested patient/subject.reference) or a flattened DB row (bare-UUID columns).
 * Used to stamp sync_conflicts.patient_ref so the safety monitor can attribute
 * an unresolved conflict to a patient.
 */
function extractPatientRef(data: Record<string, unknown>): string | null {
  const nested =
    (data.patient as { reference?: string } | undefined)?.reference ??
    (data.subject as { reference?: string } | undefined)?.reference
  if (typeof nested === 'string' && nested.length > 0) return nested
  const flat = (data.patientRef ?? data.subjectReference ?? data.subjectId) as unknown
  if (typeof flat === 'string' && flat.length > 0) {
    return flat.includes('/') ? flat : `Patient/${flat}`
  }
  return null
}

/**
 * Map table names to the column used to scope pull results to a patient.
 * Bare-UUID columns (subject_id) and bare-UUID-bearing text columns
 * (patient_ref, subject_reference) are matched against the bare patientId.
 */
const PATIENT_COLUMN_MAP: Record<string, string | null> = {
  encounters: 'subject_id',
  observations: 'subject_id',
  conditions: 'subject_id',
  medication_requests: 'subject_reference',
  allergy_intolerances: 'patient_ref',
  medication_statements: 'subject_reference',
  consent_records: 'patient_id',
  patients: 'id',
  // Linked through encounter — no direct patient column
  soap_ledger: null,
}

/**
 * Sync domain router.
 * Story 9.2: Background Sync Worker & Retry Logic — Hub sync endpoints.
 */
export const syncRouter = createTRPCRouter({
  /**
   * sync.push — accept a batch of sync operations from a spoke.
   * Validates RBAC, applies field-level encryption, detects conflicts,
   * and returns per-operation results.
   */
  push: protectedProcedure
    .input(
      z.object({
        operations: z.array(SyncOperationSchema).min(1).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Pass the caller's org as the default so every audit row satisfies the
      // audit_log.org_id NOT NULL constraint (the RPC already accepts p_org_id).
      const audit = new AuditLogger(ctx.supabase, ctx.user.orgId ?? undefined)
      const results: Array<{
        resourceId: string
        success: boolean
        conflict?: {
          remoteVersion: {
            id: string
            data: Record<string, unknown>
            hlcTimestamp: { wallMs: number; counter: number; nodeId: string }
            version: string
          }
        }
        error?: string
        /**
         * For a rejected duplicate-open-encounter create: the id of the
         * canonical open encounter the spoke should adopt/resume instead.
         */
        canonicalId?: string
      }> = []

      for (const op of input.operations) {
        try {
          // RBAC validation per resource type
          const userRole = ctx.user.role
          const { hasResourceAccess } = await import('../rbac')
          if (!hasResourceAccess(userRole, op.resourceType)) {
            results.push({
              resourceId: op.resourceId,
              success: false,
              error: 'FORBIDDEN',
            })
            continue
          }

          const tableName = RESOURCE_TABLE_MAP[op.resourceType]
          if (!tableName) {
            results.push({
              resourceId: op.resourceId,
              success: false,
              error: `Unknown resource type: ${op.resourceType}`,
            })
            continue
          }

          const payload = JSON.parse(op.payload) as Record<string, unknown>

          // Check for conflict: compare incoming HLC with stored HLC.
          // Skip for tables without an hlc_timestamp column (e.g. consent_records,
          // which syncs via its dedicated append-only ledger).
          const existing = NO_HLC_TABLES.has(tableName)
            ? null
            : (await ctx.supabase
                .from(tableName)
                .select('id, hlc_timestamp')
                .eq('id', op.resourceId)
                .maybeSingle()).data

          if (existing && existing.hlc_timestamp) {
            const incomingHlc = deserializeHlc(op.hlcTimestamp)
            const storedHlc = deserializeHlc(existing.hlc_timestamp as string)
            const cmp = compareHlc(incomingHlc, storedHlc)
            const withinWindow =
              Math.abs(incomingHlc.wallMs - storedHlc.wallMs) <= TIER1_CONFLICT_WINDOW_MS

            // Only fetch the stored row + resolve when there is a *potential* conflict:
            // the incoming write is older/equal (optimistic concurrency) OR concurrent
            // with the stored write (within the 60s window). A clearly-later write
            // (strictly newer AND outside the window) is a clean sequential update —
            // fall straight through to the upsert below with no extra query.
            if (cmp <= 0 || withinWindow) {
              const { data: fullRow } = await ctx.supabase
                .from(tableName)
                .select('*')
                .eq('id', op.resourceId)
                .single()

              if (fullRow) {
                const storedData = db.fromRow(fullRow) as Record<string, unknown>

                // Resolve by clinical safety tier. resolveConflict computes the
                // effective tier (active vs. historical) from both versions.
                const resolution = resolveConflict(
                  {
                    id: op.resourceId,
                    data: storedData,
                    hlcTimestamp: storedHlc,
                    version: existing.hlc_timestamp as string,
                  },
                  {
                    id: op.resourceId,
                    data: payload,
                    hlcTimestamp: incomingHlc,
                    version: op.hlcTimestamp,
                  },
                  op.resourceType,
                )

                // Tier-1 safety-critical data (allergies, active meds/conditions)
                // resolves APPEND_ONLY — never LWW-overwrite. Treat as a conflict
                // for physician review only when the incoming write genuinely
                // diverged on another device: a different HLC node AND either a
                // stale write (cmp <= 0) or a concurrent one (within the 60s window).
                // Same-device linear edits and clearly-later cross-device updates
                // are legitimate updates, not conflicts.
                const differentNode = incomingHlc.nodeId !== storedHlc.nodeId
                const isTier1Conflict =
                  resolution.strategy === 'APPEND_ONLY' &&
                  differentNode &&
                  (cmp <= 0 || withinWindow)

                if (isTier1Conflict) {
                  // Persist BOTH versions (encrypted at rest) as an UNRESOLVED
                  // conflict. If we cannot record it, FAIL the op — silently
                  // accepting the write would be Tier-1 data loss (safety rule 5).
                  const patientRef =
                    extractPatientRef(payload) ?? extractPatientRef(storedData)

                  const { error: conflictError } = await ctx.supabase
                    .from('sync_conflicts')
                    .insert({
                      resource_type: op.resourceType,
                      resource_id: op.resourceId,
                      patient_ref: patientRef,
                      status: 'UNRESOLVED',
                      local_version: encryptJsonbValue(storedData),
                      remote_version: encryptJsonbValue(payload),
                      resolution: {
                        strategy: resolution.strategy,
                        conflictFlag: resolution.conflictFlag,
                        blocksPrescription: resolution.blocksPrescription,
                        detectedBy: 'sync.push',
                      },
                    })

                  if (conflictError) {
                    results.push({
                      resourceId: op.resourceId,
                      success: false,
                      error: 'CONFLICT_PERSIST_FAILED',
                    })
                    continue
                  }

                  // Audit the conflict — opaque ids only, never PHI.
                  try {
                    await audit.emit({
                      actorId: ctx.user.sub,
                      actorRole: ctx.user.role as Parameters<typeof audit.emit>[0]['actorRole'],
                      action: 'READ' as Parameters<typeof audit.emit>[0]['action'],
                      resourceType: op.resourceType as Parameters<typeof audit.emit>[0]['resourceType'],
                      resourceId: op.resourceId,
                      sessionId: ctx.user.sessionId,
                      outcome: 'SUCCESS' as const,
                      metadata: {
                        source: 'sync.push',
                        reason: 'tier1_conflict_recorded',
                        incomingHlc: op.hlcTimestamp,
                        storedHlc: existing.hlc_timestamp,
                      },
                    })
                  } catch {
                    // Audit failure should not block the conflict response.
                  }

                  results.push({
                    resourceId: op.resourceId,
                    success: false,
                    conflict: {
                      remoteVersion: {
                        id: op.resourceId,
                        data: storedData,
                        hlcTimestamp: storedHlc,
                        version: existing.hlc_timestamp as string,
                      },
                    },
                  })
                  continue
                }

                // Not an append-only Tier-1 conflict. An older/equal incoming write
                // is rejected (optimistic concurrency) so the spoke re-pulls and
                // re-resolves. Strictly-newer writes (Tier-2 timestamp-wins, Tier-3
                // LWW, or a legitimate Tier-1 sequential update) fall through to the
                // upsert below.
                if (cmp <= 0) {
                  try {
                    await audit.emit({
                      actorId: ctx.user.sub,
                      actorRole: ctx.user.role as Parameters<typeof audit.emit>[0]['actorRole'],
                      action: 'READ' as Parameters<typeof audit.emit>[0]['action'],
                      resourceType: op.resourceType as Parameters<typeof audit.emit>[0]['resourceType'],
                      resourceId: op.resourceId,
                      sessionId: ctx.user.sessionId,
                      outcome: 'SUCCESS' as const,
                      metadata: {
                        source: 'sync.push',
                        reason: 'conflict_detection',
                        incomingHlc: op.hlcTimestamp,
                        storedHlc: existing.hlc_timestamp,
                      },
                    })
                  } catch {
                    // Audit failure should not block conflict response
                  }

                  results.push({
                    resourceId: op.resourceId,
                    success: false,
                    conflict: {
                      remoteVersion: {
                        id: op.resourceId,
                        data: storedData,
                        hlcTimestamp: storedHlc,
                        version: existing.hlc_timestamp as string,
                      },
                    },
                  })
                  continue
                }
              }
            }
          }

          // Flatten FHIR resource shape to match flat DB columns,
          // then apply snake_case + field-level encryption.
          const flat = flattenForDb(op.resourceType, payload)

          // Stamp org_id from the authenticated context for org-scoped tables.
          // These columns are NOT NULL with no default, so a missing org context
          // is a hard error rather than a silent NULL write.
          if (ORG_SCOPED_TABLES.has(tableName)) {
            if (!ctx.user.orgId) {
              results.push({
                resourceId: op.resourceId,
                success: false,
                error: 'MISSING_ORG_CONTEXT',
              })
              continue
            }
            flat.orgId = ctx.user.orgId
          }

          // allergy_intolerances carries sync provenance: synced_by is NOT NULL
          // with no default. The flattener can't know the actor, so stamp it from
          // the authenticated context here (mirrors the allergy.create endpoint).
          // Without this, every AllergyIntolerance push fails a NOT NULL violation
          // and Tier-1 safety data never reaches the Hub.
          if (tableName === 'allergy_intolerances') {
            flat.syncedBy = ctx.user.sub
            flat.syncedAt = new Date().toISOString()
          }

          const row = db.toRow({
            ...flat,
            hlcTimestamp: op.hlcTimestamp,
          } as Record<string, unknown>)

          const { error: upsertError } = await ctx.supabase
            .from(tableName)
            .upsert(row, { onConflict: 'id' })

          if (upsertError) {
            // Backstop for the duplicate-open-encounter bug: the partial unique index
            // uq_encounters_open_per_patient_practitioner forbids a 2nd in-progress
            // encounter for the same (patient, practitioner). A spoke that created one
            // offline/in a separate session (its local cache lacked the still-open
            // encounter) will hit this on push. Do NOT create a second open encounter —
            // resolve to the canonical open encounter the spoke should resume, and
            // report it non-destructively (the invariant is preserved at the Hub).
            const isOpenEncounterDup =
              op.resourceType === 'Encounter' &&
              upsertError.code === '23505' &&
              `${upsertError.message} ${upsertError.details ?? ''}`.includes(
                'uq_encounters_open_per_patient_practitioner',
              )

            if (isOpenEncounterDup) {
              const subjectId = (payload.subject as { reference?: string } | undefined)?.reference?.replace(
                'Patient/',
                '',
              )
              const practitionerRef = (
                payload.participant as Array<{ individual?: { reference?: string } }> | undefined
              )?.[0]?.individual?.reference

              let canonicalId: string | undefined
              if (subjectId && practitionerRef) {
                const { data: openEnc } = await ctx.supabase
                  .from('encounters')
                  .select('id')
                  .eq('subject_id', subjectId)
                  .eq('status', 'in-progress')
                  .contains(
                    'participant',
                    JSON.stringify([{ individual: { reference: practitionerRef } }]),
                  )
                  .maybeSingle()
                canonicalId = openEnc?.id
              }

              try {
                await audit.emit({
                  actorId: ctx.user.sub,
                  actorRole: ctx.user.role as Parameters<typeof audit.emit>[0]['actorRole'],
                  action: 'SYNC' as Parameters<typeof audit.emit>[0]['action'],
                  resourceType: 'Encounter' as Parameters<typeof audit.emit>[0]['resourceType'],
                  resourceId: op.resourceId,
                  sessionId: ctx.user.sessionId,
                  outcome: 'DENIED' as const,
                  metadata: {
                    source: 'sync.push',
                    reason: 'duplicate_open_encounter_rejected',
                    canonicalId: canonicalId ?? null,
                  },
                })
              } catch {
                // Audit failure should not change the response
              }

              results.push({
                resourceId: op.resourceId,
                success: false,
                error: 'DUPLICATE_OPEN_ENCOUNTER',
                canonicalId,
              })
              continue
            }

            results.push({
              resourceId: op.resourceId,
              success: false,
              error: upsertError.message,
            })
            continue
          }

          // Audit log
          try {
            await audit.emit({
              actorId: ctx.user.sub,
              actorRole: ctx.user.role as Parameters<typeof audit.emit>[0]['actorRole'],
              action: 'SYNC' as Parameters<typeof audit.emit>[0]['action'],
              resourceType: op.resourceType as Parameters<typeof audit.emit>[0]['resourceType'],
              resourceId: op.resourceId,
              sessionId: ctx.user.sessionId,
              outcome: 'SUCCESS' as const,
              metadata: {
                syncAction: op.action,
                hlcTimestamp: op.hlcTimestamp,
                source: 'sync.push',
              },
            })
          } catch {
            // Audit failure should not block sync
          }

          results.push({ resourceId: op.resourceId, success: true })
        } catch {
          results.push({
            resourceId: op.resourceId,
            success: false,
            error: 'Internal error',
          })
        }
      }

      return { results }
    }),

  /**
   * sync.pull — return changes since a given HLC timestamp for a patient's resources.
   * Returns resources decrypted and case-transformed.
   */
  pull: protectedProcedure
    .input(
      z.object({
        patientId: z.string().min(1),
        sinceHlc: z.string().min(1),
        resourceTypes: z.array(z.string().min(1)).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { hasResourceAccess } = await import('../rbac')
      const userRole = ctx.user.role

      const targetTables = input.resourceTypes
        ? input.resourceTypes
            .map((rt) => ({ type: rt, table: RESOURCE_TABLE_MAP[rt] }))
            .filter((t): t is { type: string; table: string } => !!t.table)
        : Object.entries(RESOURCE_TABLE_MAP).map(([type, table]) => ({ type, table }))

      const changes: Array<{
        resourceType: string
        resourceId: string
        data: Record<string, unknown>
        hlcTimestamp: string
      }> = []

      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)

      for (const { type, table } of targetTables) {
        // RBAC: skip resource types the user cannot access
        if (!hasResourceAccess(userRole, type)) continue

        // Skip tables without an hlc_timestamp column — they don't participate
        // in the generic HLC pull (consent syncs via its dedicated ledger path).
        if (NO_HLC_TABLES.has(table)) continue

        let query = ctx.supabase
          .from(table)
          .select('*')
          .gt('hlc_timestamp', input.sinceHlc)
          .order('hlc_timestamp', { ascending: true })

        // Patient-scope filter: restrict results to the requested patient.
        const patientCol = PATIENT_COLUMN_MAP[table]
        if (patientCol) {
          query = query.eq(patientCol, input.patientId)
        } else if (table === 'soap_ledger') {
          // soap_ledger has no direct patient column — it links via encounter_id.
          // Resolve the patient's encounters first, then scope SOAP notes to them.
          // Without this filter, a ClinicalImpression pull returned EVERY patient's
          // SOAP notes to any clinician (mass PHI exposure).
          const { data: encRows } = await ctx.supabase
            .from('encounters')
            .select('id')
            .eq('subject_id', input.patientId)
          const encounterIds = (encRows ?? []).map((r) => (r as { id: string }).id)
          if (encounterIds.length === 0) continue // no encounters → no SOAP for this patient
          query = query.in('encounter_id', encounterIds)
        } else {
          // No patient-scoping column and no known linkage — skip rather than
          // return every patient's rows (data-minimization fail-safe).
          continue
        }

        const { data: rows } = await query

        if (!rows) continue

        const decrypted = db.fromRows(rows) as Array<Record<string, unknown>>
        for (const row of decrypted) {
          changes.push({
            resourceType: type,
            resourceId: row.id as string,
            data: row,
            hlcTimestamp: row.hlcTimestamp as string,
          })
        }
      }

      // Audit: log PHI read for sync pull
      try {
        await audit.emit({
          actorId: ctx.user.sub,
          actorRole: ctx.user.role as Parameters<typeof audit.emit>[0]['actorRole'],
          action: 'READ' as Parameters<typeof audit.emit>[0]['action'],
          resourceType: 'Patient' as Parameters<typeof audit.emit>[0]['resourceType'],
          resourceId: input.patientId,
          sessionId: ctx.user.sessionId,
          outcome: 'SUCCESS' as const,
          metadata: {
            source: 'sync.pull',
            resourceTypesQueried: targetTables.map((t) => t.type),
            changesReturned: changes.length,
          },
        })
      } catch {
        // Audit failure should not block sync pull
      }

      return { changes }
    }),
})
