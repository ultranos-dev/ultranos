import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { AuditLogger } from '@ultranos/audit-logger'
import { db } from '@/lib/supabase'
import { compareHlc, deserializeHlc } from '@ultranos/sync-engine'
import { flattenForDb } from '@/lib/resource-mappers'

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

            if (cmp <= 0) {
              // Incoming is older or same — conflict
              const { data: fullRow } = await ctx.supabase
                .from(tableName)
                .select('*')
                .eq('id', op.resourceId)
                .single()

              if (fullRow) {
                const remoteData = db.fromRow(fullRow) as Record<string, unknown>

                // Audit: log PHI read during conflict detection
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
                      data: remoteData,
                      hlcTimestamp: storedHlc,
                      version: existing.hlc_timestamp as string,
                    },
                  },
                })
                continue
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

        // Patient-scope filter: restrict results to the requested patient
        const patientCol = PATIENT_COLUMN_MAP[table]
        if (patientCol) {
          query = query.eq(patientCol, input.patientId)
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
