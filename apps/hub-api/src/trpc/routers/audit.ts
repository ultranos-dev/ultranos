import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { AuditLogger } from '@ultranos/audit-logger'
import { AuditAction, AuditResourceType, UserRole, LabRole } from '@ultranos/shared-types'
import { checkRateLimit, deriveIdentifier } from '../middleware/rateLimit'

/**
 * Story 56.4 (M-HUB-3): the claimable `actorRole` is the platform UserRole set
 * PLUS the lab sub-roles (LabRole) that are NOT themselves UserRole members —
 * SENIOR_TECH / SUPERVISOR / LAB_MANAGER (LAB_TECH is already a UserRole). The
 * lab authorization workflow (ResultReviewPanel) and outbreak modals deliberately
 * record the authorizing lab TIER as actorRole — that sub-role IS the
 * accountability-relevant fact (canAuthorize() gates on it), so collapsing them to
 * LAB_TECH would destroy an audit distinction. Omitting them made audit.sync 400 on
 * any batch containing a supervisor/manager action, silently dropping the whole
 * batch (Rule #6). No new trust surface: actorRole is already client-supplied and
 * only shape-validated; actorId is forced server-side. The audit_log.actor_role
 * column is free text, so these values persist and render (format-role.ts) fine.
 */
const clientClaimableActorRoleValues = Array.from(
  new Set<string>([...Object.values(UserRole), ...Object.values(LabRole)]),
) as [string, ...string[]]

/**
 * Story 56.4 (M-HUB-3): audit.sync accepts CLIENT-submitted events, so the
 * claimable `action` / `resourceType` are restricted to an allowlist rather than
 * the full server enums. Anything a spoke can legitimately record while offline
 * (clinical reads/writes, consent changes, session lifecycle, sync bookkeeping)
 * is claimable; server-authoritative events — lab approval/suspension, KYC
 * decisions, anomaly moderation, license lifecycle, security violations,
 * break-glass, MFA_FAIL, etc. — are NOT, so a compromised client cannot forge
 * privileged audit entries. This is the superset of what the OPD/pharmacy/lab
 * spokes actually emit (verified against their client audit-logger call sites).
 */
const CLIENT_CLAIMABLE_ACTIONS = [
  AuditAction.READ,
  AuditAction.CREATE,
  AuditAction.UPDATE,
  AuditAction.DELETE_REQUEST,
  AuditAction.CONSENT_GRANT,
  AuditAction.CONSENT_REVOKE,
  AuditAction.SYNC,
  AuditAction.LOGIN,
  AuditAction.LOGOUT,
  AuditAction.EXPORT,
  AuditAction.PHI_READ,
  AuditAction.PHI_WRITE,
  AuditAction.PHI_CLEANUP,
] as const

const CLIENT_CLAIMABLE_RESOURCE_TYPES = [
  AuditResourceType.PATIENT,
  AuditResourceType.PRESCRIPTION,
  AuditResourceType.LAB_RESULT,
  AuditResourceType.CLINICAL_NOTE,
  AuditResourceType.OBSERVATION,
  AuditResourceType.ENCOUNTER,
  AuditResourceType.CONSENT,
  AuditResourceType.USER_ACCOUNT,
  AuditResourceType.NOTIFICATION,
  AuditResourceType.ALLERGY,
  AuditResourceType.MEDICATION_STATEMENT,
  AuditResourceType.MEDICATION_DISPENSE,
  AuditResourceType.APPOINTMENT,
  AuditResourceType.SERVICE_REQUEST,
  AuditResourceType.DIAGNOSTIC_REPORT,
  AuditResourceType.SYSTEM,
  // Operational / spoke-emitted resource types (Story 49-1 + lab/pharmacy audit
  // clients). These are legitimately claimed by spoke clients; omitting them made
  // audit.sync 400 on any batch containing one, silently dropping the whole batch
  // (Rule #6). Hub-only types (PRESCRIBING_ANOMALY / KYC_SUBMISSION / LAB_REGISTRATION)
  // stay OUT — a client must never claim those.
  AuditResourceType.PRACTITIONER,
  AuditResourceType.LAB_SAMPLE,
  AuditResourceType.SPECIMEN,
  AuditResourceType.TEMPERATURE_MONITORING,
  AuditResourceType.WASTE_CONTAINER,
  AuditResourceType.EMPLOYEE_HEALTH,
  AuditResourceType.SHIFT_HANDOVER,
  AuditResourceType.CONSULTATION,
  AuditResourceType.DATA_BUDGET,
  AuditResourceType.AI_PROVENANCE,
  AuditResourceType.CASH_DRAWER,
  AuditResourceType.INVOICE,
  AuditResourceType.REFUND,
  AuditResourceType.GOODS_RECEIPT,
  AuditResourceType.PURCHASE_ORDER,
  AuditResourceType.STOCK_BATCH,
  AuditResourceType.SUPPLIER_INVOICE,
  AuditResourceType.SUPPLIER_PAYMENT,
  AuditResourceType.SUPPLY_REQUEST,
] as const

const clientClaimableActionValues = CLIENT_CLAIMABLE_ACTIONS as unknown as [string, ...string[]]
const clientClaimableResourceTypeValues = CLIENT_CLAIMABLE_RESOURCE_TYPES as unknown as [string, ...string[]]

/** Rate limit for client audit drains: generous, non-auth-critical (fail-open). */
const AUDIT_SYNC_RATE_LIMIT = { limit: 120, windowSec: 60 } as const

/**
 * Audit domain router.
 * Story 8.1: Client-Side Audit Ledger — Hub sync endpoint.
 *
 * Accepts batches of client-side audit events and feeds each
 * through the server-side AuditLogger (SHA-256 hash chaining).
 */
export const auditRouter = createTRPCRouter({
  /**
   * audit.sync — receive a batch of client audit events.
   * Any authenticated user can sync their own audit events.
   * actorId is overridden server-side with ctx.user.id to prevent impersonation.
   * Returns per-event success/failure so the client can update local status.
   */
  sync: protectedProcedure
    .input(
      z.object({
        events: z
          .array(
            z.object({
              id: z.string().uuid(),
              actorId: z.string().min(1),
              actorRole: z.enum(clientClaimableActorRoleValues),
              // Story 56.4 (M-HUB-3): only client-claimable actions/resource types.
              action: z.enum(clientClaimableActionValues),
              resourceType: z.enum(clientClaimableResourceTypeValues),
              resourceId: z.string().min(1),
              patientId: z.string().optional(),
              hlcTimestamp: z.string().min(1),
              metadata: z.record(z.unknown()).optional(),
              queuedAt: z.string().datetime(),
            }),
          )
          .min(1)
          .max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Story 56.4 (M-HUB-3): rate limit the client drain (keyed by the
      // authenticated user). Non-auth-critical → fail-open so a Redis blip never
      // blocks a legitimate offline-audit drain.
      const identifier = deriveIdentifier(ctx)
      const rl = await checkRateLimit(identifier, 'audit.sync', AUDIT_SYNC_RATE_LIMIT, 'auditSync')
      if (!rl.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Audit sync rate limit exceeded — try again later',
        })
      }

      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const results: Array<{ id: string; success: boolean }> = []
      const serverActorId = ctx.user.sub

      for (const event of input.events) {
        try {
          await audit.emit({
            actorId: serverActorId,
            actorRole: event.actorRole as Parameters<typeof audit.emit>[0]['actorRole'],
            action: event.action as Parameters<typeof audit.emit>[0]['action'],
            resourceType: event.resourceType as Parameters<typeof audit.emit>[0]['resourceType'],
            resourceId: event.resourceId,
            patientId: event.patientId,
            sessionId: ctx.user.sessionId,
            outcome: 'SUCCESS' as const,
            metadata: {
              ...event.metadata,
              clientQueuedAt: event.queuedAt,
              clientHlcTimestamp: event.hlcTimestamp,
              clientEventId: event.id,
              source: 'client-audit-sync',
            },
          })
          results.push({ id: event.id, success: true })
        } catch {
          results.push({ id: event.id, success: false })
        }
      }

      return { results }
    }),
})
