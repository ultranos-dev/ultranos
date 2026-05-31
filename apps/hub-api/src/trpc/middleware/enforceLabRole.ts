import { TRPCError } from '@trpc/server'
import { type LabPermission, hasLabPermission } from '@ultranos/shared-types'
import type { LabContext } from '../rbac'

/**
 * tRPC middleware factory that gates access behind a specific lab permission.
 * Story 42.1 AC 2, 4: Server-side role enforcement.
 *
 * Must be used AFTER labRestrictedProcedure which populates ctx.lab.
 * ADMIN bypass: no lab context present (set by labRestrictedProcedure).
 */
export function enforceLabRole(requiredPermission: LabPermission) {
  return async (opts: {
    ctx: { lab?: LabContext; [key: string]: unknown }
    input: unknown
    next: (opts: { ctx: Record<string, unknown> }) => Promise<unknown>
  }) => {
    // ADMIN bypass — explicit role check for safety
    if (!opts.ctx.lab) {
      const user = opts.ctx.user as { role?: string } | undefined
      if (user?.role === 'ADMIN') {
        return opts.next({ ctx: opts.ctx })
      }
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Lab context required for permission check',
      })
    }

    const { labRole } = opts.ctx.lab

    if (!hasLabPermission(labRole, requiredPermission)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Access denied — requires ${requiredPermission} permission (your role: ${labRole})`,
      })
    }

    return opts.next({ ctx: opts.ctx })
  }
}
