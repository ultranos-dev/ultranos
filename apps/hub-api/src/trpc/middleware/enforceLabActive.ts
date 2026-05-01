import { TRPCError } from '@trpc/server'
import type { LabContext } from '../rbac'

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
  return async (opts: {
    ctx: { lab?: LabContext; [key: string]: unknown }
    input: unknown
    next: (opts: { ctx: typeof opts.ctx }) => Promise<unknown>
  }) => {
    // ADMIN bypass — no lab context present (set by labRestrictedProcedure)
    if (!opts.ctx.lab) {
      return opts.next({ ctx: opts.ctx })
    }

    const { labStatus } = opts.ctx.lab

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

    return opts.next({ ctx: opts.ctx })
  }
}
