import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import type { FacilityLocation, FacilityLocationKind } from '@ultranos/shared-types'

/** ADMIN-role-only guard (mirrors pharmacy.ts). */
const adminProcedure = protectedProcedure.use(async (opts) => {
  if (opts.ctx.user?.role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' })
  }
  return opts.next(opts)
})

export function toFacilityLocation(row: Record<string, unknown>): FacilityLocation {
  return {
    id: row.id as string,
    facilityId: row.facility_id as string,
    name: row.name as string,
    kind: row.kind as FacilityLocationKind,
    isPrimary: row.is_primary as boolean,
    isActive: row.is_active as boolean,
    createdAt: (row.created_at as string) ?? undefined,
    updatedAt: (row.updated_at as string) ?? undefined,
  }
}

const kindSchema = z.enum(['store', 'room', 'fridge', 'cabinet', 'other'])

async function selectByFacility(supabase: any, facilityId: string): Promise<FacilityLocation[]> {
  const { data, error } = await supabase
    .from('facility_locations')
    .select('*')
    .eq('facility_id', facilityId)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true })
  if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
  return (data ?? []).map(toFacilityLocation)
}

export const facilityLocationsRouter = createTRPCRouter({
  // Spoke pull contract: caller's own facility, active AND inactive rows.
  listForFacility: protectedProcedure.query(async ({ ctx }): Promise<FacilityLocation[]> => {
    const facilityId = ctx.user?.facilityId
    if (!facilityId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'MISSING_FACILITY_CONTEXT' })
    }
    return selectByFacility(ctx.supabase, facilityId)
  }),

  listForAdmin: adminProcedure
    .input(z.object({ facilityId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<FacilityLocation[]> => {
      return selectByFacility(ctx.supabase, input.facilityId)
    }),
})

export { kindSchema, adminProcedure }
