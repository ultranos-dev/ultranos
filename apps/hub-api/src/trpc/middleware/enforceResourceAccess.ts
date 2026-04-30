import { TRPCError } from '@trpc/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasResourceAccess } from '../rbac'

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
  return async (opts: {
    ctx: { supabase: SupabaseClient; user: { sub: string; role: string; sessionId: string } }
    input: Record<string, unknown>
    next: (opts: { ctx: typeof opts.ctx }) => Promise<unknown>
  }) => {
    const userRole = opts.ctx.user.role

    if (!hasResourceAccess(userRole, resourceType)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Access denied — insufficient permissions for this resource',
      })
    }

    return opts.next({ ctx: opts.ctx })
  }
}
