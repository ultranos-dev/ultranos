import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import type { PharmacyDirectoryEntry } from '@ultranos/shared-types'

function toDirectoryEntry(row: Record<string, unknown>): PharmacyDirectoryEntry {
  return {
    id: row.id as string,
    name: row.name as string,
    address: (row.address as string) ?? undefined,
    province: (row.province as string) ?? undefined,
    district: (row.district as string) ?? undefined,
    facilityType: (row.facility_type as PharmacyDirectoryEntry['facilityType']),
    updatedAt: (row.updated_at as string) ?? undefined,
  }
}

/**
 * ADMIN-role-only middleware guard.
 * Rejects non-ADMIN callers with FORBIDDEN error.
 */
const adminProcedure = protectedProcedure.use(async (opts) => {
  if (opts.ctx.user?.role !== 'ADMIN') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    })
  }
  return opts.next(opts)
})

const pharmacyInput = z.object({
  name: z.string().min(1).max(200),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().max(300).optional(),
  province: z.string().max(120).optional(),
  district: z.string().max(120).optional(),
})

function toFacility(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    address: (row.address as string) ?? undefined,
    province: (row.province as string) ?? undefined,
    district: (row.district as string) ?? undefined,
    facilityType: (row.facility_type as 'pharmacy' | 'clinic' | 'hospital'),
    isActive: row.is_active as boolean,
  }
}

export const pharmacyRouter = createTRPCRouter({
  search: protectedProcedure
    .input(z.object({ q: z.string().min(1).max(100), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }): Promise<PharmacyDirectoryEntry[]> => {
      const safeQ = input.q.replace(/[,()"]/g, ' ').trim().toLowerCase()
      if (!safeQ) return []
      const likeQ = `%${safeQ}%`
      const { data, error } = await ctx.supabase
        .from('pharmacy_facilities')
        .select('id, name, address, province, district, facility_type, updated_at')
        .eq('facility_type', 'pharmacy')
        .eq('is_active', true)
        .or([`name.ilike.${likeQ}`, `address.ilike.${likeQ}`, `province.ilike.${likeQ}`, `district.ilike.${likeQ}`].join(','))
        .limit(input.limit)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      return (data ?? []).map(toDirectoryEntry)
    }),

  sync: protectedProcedure
    .input(z.object({ since: z.string().optional(), limit: z.number().int().min(1).max(1000).default(500) }))
    .query(async ({ ctx, input }): Promise<{ pharmacies: PharmacyDirectoryEntry[]; latestUpdatedAt: string | null }> => {
      let query = ctx.supabase
        .from('pharmacy_facilities')
        .select('id, name, address, province, district, facility_type, updated_at')
        .eq('facility_type', 'pharmacy')
        .eq('is_active', true)
        .order('updated_at', { ascending: true })
        .limit(input.limit)
      if (input.since) query = query.gt('updated_at', input.since)
      const { data, error } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      const pharmacies = (data ?? []).map(toDirectoryEntry)
      const latestUpdatedAt = pharmacies.length ? pharmacies[pharmacies.length - 1]!.updatedAt ?? null : null
      return { pharmacies, latestUpdatedAt }
    }),

  listForAdmin: adminProcedure
    .input(z.object({ cursor: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(50), q: z.string().max(100).optional() }))
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('pharmacy_facilities')
        .select('*')
        .eq('facility_type', 'pharmacy')
        .order('name', { ascending: true })
        .range(input.cursor, input.cursor + input.limit - 1)
      if (input.q) {
        const safeQ = input.q.replace(/[,()"]/g, ' ').trim().toLowerCase()
        if (safeQ) query = query.ilike('name', `%${safeQ}%`)
      }
      const { data, error } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      const pharmacies = (data ?? []).map(toFacility)
      const nextCursor = pharmacies.length === input.limit ? input.cursor + input.limit : null
      return { pharmacies, nextCursor }
    }),

  create: adminProcedure
    .input(pharmacyInput)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('pharmacy_facilities')
        .insert({ ...input, facility_type: 'pharmacy', is_active: true })
        .select('*').single()
      if (error || !data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      return toFacility(data)
    }),

  update: adminProcedure
    .input(pharmacyInput.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input
      const { data, error } = await ctx.supabase
        .from('pharmacy_facilities').update(fields).eq('id', id).select('*').single()
      if (error || !data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      return toFacility(data)
    }),

  setActive: adminProcedure
    .input(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('pharmacy_facilities').update({ is_active: input.isActive }).eq('id', input.id).select('*').single()
      if (error || !data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      return toFacility(data)
    }),
})
