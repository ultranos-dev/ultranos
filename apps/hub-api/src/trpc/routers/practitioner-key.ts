import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { AuditLogger } from '@ultranos/audit-logger'
import { createTRPCRouter, protectedProcedure } from '../init'
import { roleRestrictedProcedure } from '../rbac'

/**
 * Practitioner Key Lifecycle router.
 * Story 7.4: Practitioner Key Lifecycle Management.
 *
 * Manages Ed25519 public key status, revocation, and the Key Revocation List (KRL)
 * used by edge devices to reject signatures from compromised/expired keys.
 */
export const practitionerKeyRouter = createTRPCRouter({
  /**
   * AC 2: Get the current status of a practitioner's public key.
   * Clients call this to re-validate a cached key after TTL expiry.
   */
  getKeyStatus: protectedProcedure
    .input(
      z.object({
        publicKey: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('practitioner_keys')
        .select('id, practitioner_id, public_key_ed25519, revoked_at, expires_at, created_at')
        .eq('public_key_ed25519', input.publicKey)
        .single()

      if (error || !data) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Public key not found',
        })
      }

      // Determine key status: revoked > expired > active
      let status: 'active' | 'revoked' | 'expired'
      if (data.revoked_at) {
        status = 'revoked'
      } else if (new Date(data.expires_at).getTime() < Date.now()) {
        status = 'expired'
      } else {
        status = 'active'
      }

      // Audit: key status lookup (practitioner_id is PHI-adjacent)
      const audit = new AuditLogger(ctx.supabase)
      audit.emit({
        action: 'READ',
        resourceType: 'PractitionerKey',
        resourceId: data.id,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: { keyStatus: status },
      }).catch(() => {})

      return {
        status,
        practitionerId: data.practitioner_id,
        publicKey: data.public_key_ed25519,
        revokedAt: data.revoked_at,
        expiresAt: data.expires_at,
      }
    }),

  /**
   * AC 3: Get the Key Revocation List (KRL) for sync to edge devices.
   * Returns revoked keys with cursor-based pagination for bandwidth efficiency.
   */
  getRevocationList: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(1000).default(500),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 500
      let query = ctx.supabase
        .from('practitioner_keys')
        .select('public_key_ed25519, revoked_at')
        .not('revoked_at', 'is', null)
        .order('revoked_at', { ascending: true })
        .limit(limit + 1)

      if (input?.cursor) {
        query = query.gt('revoked_at', input.cursor)
      }

      const { data, error } = await query

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch revocation list',
        })
      }

      const rows = data ?? []
      const hasMore = rows.length > limit
      const results = hasMore ? rows.slice(0, limit) : rows
      const nextCursor = hasMore ? results[results.length - 1]!.revoked_at : undefined

      return {
        revokedKeys: results.map((row) => ({
          publicKey: row.public_key_ed25519,
          revokedAt: row.revoked_at,
        })),
        nextCursor,
      }
    }),

  /**
   * AC 3: Revoke a practitioner's public key. ADMIN-only.
   * Sets revoked_at on the key record; the KRL sync propagates this to edge devices.
   */
  revokeKey: roleRestrictedProcedure(['ADMIN'])
    .input(
      z.object({
        publicKey: z.string().min(1),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()

      const { data, error } = await ctx.supabase
        .from('practitioner_keys')
        .update({ revoked_at: now, revocation_reason: input.reason })
        .eq('public_key_ed25519', input.publicKey)
        .is('revoked_at', null)
        .select('id')
        .single()

      if (error || !data) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Key not found or already revoked',
        })
      }

      // Audit: key revocation is a security-critical admin action
      const audit = new AuditLogger(ctx.supabase)
      audit.emit({
        action: 'UPDATE',
        resourceType: 'PractitionerKey',
        resourceId: data.id,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: { revocationReason: input.reason },
      }).catch(() => {})

      return { revoked: true }
    }),
})
