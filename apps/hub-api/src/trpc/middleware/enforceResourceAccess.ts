import { TRPCError } from '@trpc/server'
import { hasResourceAccess } from '../rbac'
import { tInstance } from '@/trpc/init'

/**
 * tRPC middleware factory that enforces FHIR resource-level RBAC.
 *
 * Usage in a router:
 *   .use(enforceResourceAccess('MedicationRequest'))
 *
 * Checks the user's role against the ROLE_PERMISSIONS map.
 * ADMIN role bypasses all checks. Unknown roles are denied (fail-safe).
 *
 * Developer Guardrails:
 * - Fail-Safe: unknown role → FORBIDDEN
 * - Consistency: uses the single ROLE_PERMISSIONS map from rbac.ts
 */
export function enforceResourceAccess(resourceType: string) {
  return tInstance.middleware(async (opts) => {
    // Applied downstream of protectedProcedure — re-emit non-null user so the
    // narrowing propagates to procedures chained after this middleware.
    const user = opts.ctx.user
    if (!user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    if (!hasResourceAccess(user.role, resourceType)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Access denied — insufficient permissions for this resource',
      })
    }

    return opts.next({ ctx: { ...opts.ctx, user } })
  })
}
