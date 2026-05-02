import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { AuditLogger } from '@ultranos/audit-logger'
import { db } from '@/lib/supabase'
import { compareHlc, deserializeHlc } from '@ultranos/sync-engine'

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
  MedicationRequest: 'medications',
  AllergyIntolerance: 'allergy_intolerances',
  MedicationStatement: 'medication_statements',
  Consent: 'consents',
  Patient: 'patients',
}

/** Map table names to their patient reference column for pull filtering. */
const PATIENT_COLUMN_MAP: Record<string, string | null> = {
  encounters: 'subject_id',
  medications: 'patient_id',
  allergy_intolerances: 'patient_id',
  medication_statements: 'subject_reference',
  consents: 'patient_id',
  patients: 'id',
  // Linked through encounter — no direct patient column
  soap_ledger: null,
  observations: null,
  conditions: null,
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
      const audit = new AuditLogger(ctx.supabase)
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

          // Check for conflict: compare incoming HLC with stored HLC
          const { data: existing } = await ctx.supabase
            .from(tableName)
            .select('id, hlc_timestamp')
            .eq('id', op.resourceId)
            .maybeSingle()

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

          // Apply field-level encryption and persist
          const row = db.toRow({
            ...payload,
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

      const audit = new AuditLogger(ctx.supabase)

      for (const { type, table } of targetTables) {
        // RBAC: skip resource types the user cannot access
        if (!hasResourceAccess(userRole, type)) continue

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
