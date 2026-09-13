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

  create: adminProcedure
    .input(z.object({
      facilityId: z.string().uuid(),
      name: z.string().trim().min(1).max(200),
      kind: kindSchema.default('store'),
      isPrimary: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }): Promise<FacilityLocation> => {
      const { data: existing, error: exErr } = await ctx.supabase
        .from('facility_locations').select('id, is_primary').eq('facility_id', input.facilityId)
      if (exErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      const rows = (existing ?? []) as { id: string; is_primary: boolean }[]
      const forcePrimary = rows.length === 0
      const effectivePrimary = forcePrimary || input.isPrimary === true

      if (effectivePrimary && rows.some((r) => r.is_primary)) {
        const { error: clrErr } = await ctx.supabase
          .from('facility_locations').update({ is_primary: false })
          .eq('facility_id', input.facilityId).is('is_primary', true)
        if (clrErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      }

      const { data, error } = await ctx.supabase
        .from('facility_locations')
        .insert({ facility_id: input.facilityId, name: input.name, kind: input.kind, is_primary: effectivePrimary, is_active: true })
        .select('*').single()
      if (error?.code === '23503') throw new TRPCError({ code: 'NOT_FOUND', message: 'FACILITY_NOT_FOUND' })
      if (error || !data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      return toFacilityLocation(data)
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(200).optional(),
      kind: kindSchema.optional(),
      isPrimary: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }): Promise<FacilityLocation> => {
      if (input.isPrimary === false) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'CANNOT_UNSET_PRIMARY' })
      }
      // If promoting to primary, find this row's facility and clear the old primary.
      if (input.isPrimary === true) {
        const { data: row, error: rErr } = await ctx.supabase
          .from('facility_locations').select('facility_id').eq('id', input.id).single()
        if (rErr || !row) throw new TRPCError({ code: 'NOT_FOUND' })
        const { error: clrErr } = await ctx.supabase
          .from('facility_locations').update({ is_primary: false })
          .eq('facility_id', (row as { facility_id: string }).facility_id).is('is_primary', true)
        if (clrErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      }
      const fields: Record<string, unknown> = {}
      if (input.name !== undefined) fields.name = input.name
      if (input.kind !== undefined) fields.kind = input.kind
      if (input.isPrimary === true) fields.is_primary = true
      const { data, error } = await ctx.supabase
        .from('facility_locations').update(fields).eq('id', input.id).select('*').single()
      if (error || !data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      return toFacilityLocation(data)
    }),

  setActive: adminProcedure
    .input(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }): Promise<FacilityLocation> => {
      if (!input.isActive) {
        const { data: row, error: rErr } = await ctx.supabase
          .from('facility_locations').select('is_primary').eq('id', input.id).single()
        if (rErr || !row) throw new TRPCError({ code: 'NOT_FOUND' })
        if ((row as { is_primary: boolean }).is_primary) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'CANNOT_DEACTIVATE_PRIMARY' })
        }
      }
      const { data, error } = await ctx.supabase
        .from('facility_locations').update({ is_active: input.isActive }).eq('id', input.id).select('*').single()
      if (error || !data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      return toFacilityLocation(data)
    }),
})

export { kindSchema, adminProcedure }
