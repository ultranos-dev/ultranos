import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { db } from '@/lib/supabase'
import { checkConsent } from '../middleware/enforceConsent'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { AuditLogger } from '@ultranos/audit-logger'

/**
 * Consent domain router.
 * Story 5.3: Data Sharing Consent Management.
 * Handles consent sync from Health Passport and consent status checks.
 */
export const consentRouter = createTRPCRouter({
  /**
   * AC 3: Sync a consent resource from Health Passport to Hub.
   * Appends to the consent ledger (append-only — no updates/deletes).
   */
  sync: protectedProcedure
    .use(enforceResourceAccess('Consent'))
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(['ACTIVE', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED']),
        category: z.array(z.string().min(1)),
        patientRef: z.string().min(1),
        dateTime: z.string().datetime(),
        provisionStart: z.string().datetime(),
        provisionEnd: z.string().datetime().optional(),
        grantorId: z.string().min(1),
        grantorRole: z.enum(['SELF', 'GUARDIAN', 'EMERGENCY_OVERRIDE']),
        purpose: z.enum(['TREATMENT', 'ANALYTICS', 'AI_PROCESSING', 'RESEARCH', 'THIRD_PARTY_SHARE']),
        consentVersion: z.string().min(1),
        auditHash: z.string().min(1),
        hlcTimestamp: z.string().min(1),
        withdrawnAt: z.string().datetime().optional(),
        withdrawalReason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // D167: Verify grantor ID matches authenticated user to prevent impersonation.
      // Only PATIENT, GUARDIAN, and ADMIN may grant consent.
      const CONSENT_GRANTOR_ROLES = ['PATIENT', 'GUARDIAN', 'ADMIN']
      if (!CONSENT_GRANTOR_ROLES.includes(ctx.user.role)) {
        // Story 21.3: Emit security audit event before rejecting
        const roleAudit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
        try {
          await roleAudit.emit({
            action: 'SECURITY_VIOLATION',
            resourceType: 'CONSENT',
            resourceId: input.id,
            actorId: ctx.user.sub,
            actorRole: ctx.user.role,
            outcome: 'FAILURE',
            sessionId: ctx.user.sessionId,
            patientId: input.patientRef.replace('Patient/', ''),
            metadata: { reason: 'unauthorized_role', attemptedRole: ctx.user.role },
          })
        } catch {
          // Audit failure must not block the rejection
        }
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only patients, guardians, and administrators may grant consent',
        })
      }
      // ADMIN may sync on behalf of patients (override).
      if (ctx.user.role !== 'ADMIN' && input.grantorId !== ctx.user.sub) {
        // Story 21.3: Emit security audit event before rejecting
        const impersonationAudit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
        try {
          await impersonationAudit.emit({
            action: 'SECURITY_VIOLATION',
            resourceType: 'CONSENT',
            resourceId: input.id,
            actorId: ctx.user.sub,
            actorRole: ctx.user.role,
            outcome: 'FAILURE',
            sessionId: ctx.user.sessionId,
            patientId: input.patientRef.replace('Patient/', ''),
            metadata: { reason: 'grantor_impersonation' },
          })
        } catch {
          // Audit failure must not block the rejection
        }
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Consent grantor must match the authenticated user',
        })
      }

      const now = new Date().toISOString()

      // Append-only insert — never update or delete consent records
      const { data, error } = await ctx.supabase
        .from('consents')
        .insert(db.toRowRaw({
          id: input.id,
          status: input.status,
          category: input.category,
          patientRef: input.patientRef,
          dateTime: input.dateTime,
          provisionStart: input.provisionStart,
          provisionEnd: input.provisionEnd ?? null,
          grantorId: input.grantorId,
          grantorRole: input.grantorRole,
          purpose: input.purpose,
          consentVersion: input.consentVersion,
          auditHash: input.auditHash,
          hlcTimestamp: input.hlcTimestamp,
          withdrawnAt: input.withdrawnAt ?? null,
          withdrawalReason: input.withdrawalReason ?? null,
          syncedBy: ctx.user.sub,
          syncedAt: now,
        }, 'non-PHI: consents'))
        .select('id')
        .single()

      if (error) {
        // Duplicate key = already synced — idempotent success
        if (error.code === '23505') {
          return { success: true, consentId: input.id, alreadySynced: true }
        }
        console.error('Consent sync error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to sync consent record',
        })
      }

      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'Consent',
          resourceId: data.id,
          patientId: input.patientRef.replace('Patient/', ''),
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'success',
          sessionId: ctx.user.sessionId,
          metadata: { syncAction: 'consent_synced' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'Consent', resourceId: data.id })
      }

      return { success: true, consentId: data.id, alreadySynced: false }
    }),

  /**
   * Consent Expiry Warning — count of active consents expiring within 90 days.
   */
  expiringCount: protectedProcedure
    .use(enforceResourceAccess('Consent'))
    .query(async ({ ctx }) => {
      const ninetyDaysFromNow = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      const now = new Date().toISOString()

      const { count, error } = await ctx.supabase
        .from('consents')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'ACTIVE')
        .not('provision_end', 'is', null)
        .lt('provision_end', ninetyDaysFromNow)
        .gt('provision_end', now)

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to count expiring consents' })
      }

      return { count: count ?? 0 }
    }),

  /**
   * Consent Expiry Warning — list of active consents expiring within 90 days.
   */
  expiringSoon: protectedProcedure
    .use(enforceResourceAccess('Consent'))
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const ninetyDaysFromNow = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      const now = new Date().toISOString()

      const { data, error } = await ctx.supabase
        .from('consents')
        .select('id, patient_ref, provision_end, consent_version, grantor_role')
        .eq('status', 'ACTIVE')
        .not('provision_end', 'is', null)
        .lt('provision_end', ninetyDaysFromNow)
        .gt('provision_end', now)
        .order('provision_end', { ascending: true })
        .range(input.offset, input.offset + input.limit - 1)

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch expiring consents' })
      }

      // Audit
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_READ', resourceType: 'CONSENT', resourceId: 'expiring-soon',
          actorId: ctx.user.sub, actorRole: ctx.user.role, outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'expiring_soon_list', resultCount: (data ?? []).length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceId: 'expiring-soon' })
      }

      return { consents: data ?? [] }
    }),

  /**
   * Consent Renewal — supersede the current active consent and create a new one.
   */
  renew: protectedProcedure
    .use(enforceResourceAccess('Consent'))
    .input(z.object({
      patientId: z.string().uuid(),
      method: z.enum(['WRITTEN', 'VERBAL_WITNESSED']),
      witnessedBy: z.string().uuid().optional(),
      language: z.enum(['en', 'ar', 'prs']),
      version: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const patientRef = `Patient/${input.patientId}`

      // Supersede current active consent
      await ctx.supabase
        .from('consents')
        .update({ status: 'SUPERSEDED' })
        .eq('patient_ref', patientRef)
        .eq('status', 'ACTIVE')

      // Create new consent (3-year validity)
      const now = new Date().toISOString()
      const threeYearsFromNow = new Date(Date.now() + 3 * 365.25 * 24 * 60 * 60 * 1000).toISOString()

      // Compute audit hash (SHA-256 of consent fields)
      const hashInput = JSON.stringify({
        patientRef, method: input.method, version: input.version,
        language: input.language, grantorId: ctx.user.sub, timestamp: now,
      })
      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashInput))
      const auditHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

      const { error } = await ctx.supabase.from('consents').insert({
        id: crypto.randomUUID(),
        status: 'ACTIVE',
        category: ['patient-privacy'],
        patient_ref: patientRef,
        date_time: now,
        provision_start: now,
        provision_end: threeYearsFromNow,
        grantor_id: ctx.user.sub,
        grantor_role: ctx.user.role ?? 'PRACTITIONER',
        purpose: 'TREATMENT',
        consent_version: input.version,
        audit_hash: auditHash,
        hlc_timestamp: now,
        synced_by: ctx.user.sub,
        synced_at: now,
      })

      if (error) {
        console.error('[CONSENT_RENEW] Insert error:', { code: error.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to renew consent' })
      }

      // Audit
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_WRITE', resourceType: 'CONSENT', resourceId: input.patientId,
          actorId: ctx.user.sub, actorRole: ctx.user.role, outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'consent_renewal', method: input.method },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceId: input.patientId })
      }

      return { success: true }
    }),

  /**
   * AC 4: Check if consent exists for a patient + resource type.
   * Used by other routers/middleware to enforce data access.
   */
  check: protectedProcedure
    .use(enforceResourceAccess('Consent'))
    .input(
      z.object({
        patientId: z.string().min(1),
        resourceType: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const hasConsent = await checkConsent(ctx.supabase, {
        patientId: input.patientId,
        resourceType: input.resourceType,
      })

      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'Consent',
          resourceId: 'consent-check',
          patientId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'success',
          sessionId: ctx.user.sessionId,
          metadata: {
            checkedResourceType: input.resourceType,
            permitted: String(hasConsent),
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'Consent', resourceId: 'consent-check' })
      }

      return { permitted: hasConsent }
    }),
})
