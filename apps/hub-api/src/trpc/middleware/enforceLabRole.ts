import { TRPCError } from '@trpc/server'
import { type LabPermission, hasLabPermission } from '@ultranos/shared-types'
import type { LabContext } from '../rbac'
import { tInstance } from '@/trpc/init'

/**
 * tRPC middleware factory that gates access behind a specific lab permission.
 * Story 42.1 AC 2, 4: Server-side role enforcement.
 *
 * Must be used AFTER labRestrictedProcedure which populates ctx.lab.
 * ADMIN bypass: no lab context present (set by labRestrictedProcedure).
 */
export function enforceLabRole(requiredPermission: LabPermission) {
  return tInstance.middleware(async (opts) => {
    // Applied downstream of labRestrictedProcedure (→ protectedProcedure). Re-emit
    // non-null user + the injected lab context so both propagate downstream.
    const user = opts.ctx.user
    if (!user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' })
    }
    // lab context injected upstream by labRestrictedProcedure (not on base ctx).
    // Widen to `LabContext | undefined` so both return branches emit the same
    // `lab` type — otherwise tRPC intersects `undefined` & `LabContext` → `never`.
    const lab: LabContext | undefined = (opts.ctx as { lab?: LabContext }).lab

    // ADMIN bypass — explicit role check for safety
    if (!lab) {
      if (user.role !== 'ADMIN') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Lab context required for permission check',
        })
      }
    } else {
      const { labRole } = lab

      if (!hasLabPermission(labRole, requiredPermission)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Access denied — requires ${requiredPermission} permission (your role: ${labRole})`,
        })
      }
    }

    // Single return with `lab` kept at its declared `LabContext | undefined`
    // type so tRPC does not intersect the branch types down to `never`.
    return opts.next({ ctx: { ...opts.ctx, user, lab } })
  })
}
