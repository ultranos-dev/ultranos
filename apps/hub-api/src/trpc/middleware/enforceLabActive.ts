import { TRPCError } from '@trpc/server'
import type { LabContext } from '../rbac'
import { tInstance } from '@/trpc/init'

/**
 * tRPC middleware that gates access to lab upload workflows
 * behind an ACTIVE lab status.
 *
 * Story 12.1 AC 6: Only technicians with ACTIVE lab status can access upload workflows.
 *
 * Must be used AFTER labRestrictedProcedure which populates ctx.lab.
 * Returns clear errors for PENDING and SUSPENDED labs.
 */
export function enforceLabActive() {
  return tInstance.middleware(async (opts) => {
    // Applied downstream of labRestrictedProcedure (→ protectedProcedure). Re-emit
    // non-null user + the injected lab context so both propagate to downstream procedures.
    const user = opts.ctx.user
    if (!user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' })
    }
    // lab context injected upstream by labRestrictedProcedure (not on base ctx).
    // Widen to `LabContext | undefined` so both return branches emit the same
    // `lab` type — otherwise tRPC intersects `undefined` & `LabContext` → `never`.
    const lab: LabContext | undefined = (opts.ctx as { lab?: LabContext }).lab

    // ADMIN bypass — no lab context present (set by labRestrictedProcedure)
    if (lab) {
      const { labStatus } = lab

      if (labStatus === 'PENDING') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Lab registration is pending verification — upload access is not yet available',
        })
      }

      if (labStatus === 'SUSPENDED') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Lab has been suspended — contact administration to restore access',
        })
      }

      if (labStatus !== 'ACTIVE') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Lab is not in ACTIVE status — upload access denied',
        })
      }
    }

    // Single return with `lab` kept at its declared `LabContext | undefined`
    // type so tRPC does not intersect the branch types down to `never`.
    return opts.next({ ctx: { ...opts.ctx, user, lab } })
  })
}
