import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { buildFacilityCrud } from './_facility-crud'
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

const crud = buildFacilityCrud({
  table: 'pharmacy_facilities',
  typeColumn: 'facility_type',
  typeValues: ['pharmacy'],
  resourceType: 'PHARMACY',
  extraColumns: ['has_delivery', 'accepts_insurance'],
})

// Profile fields for pharmacy admin CRUD
const pharmacyProfileFields = {
  name: z.string().min(1).max(200),
  logoUrl: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  licenseRef: z.string().max(100).optional(),
  registrationAuthority: z.string().max(200).optional(),
  establishedYear: z.number().int().min(1800).max(2100).optional(),
  phone: z.string().max(40).optional(),
  altPhone: z.string().max(40).optional(),
  email: z.string().max(200).optional(),
  website: z.string().max(300).optional(),
  whatsapp: z.string().max(40).optional(),
  address: z.string().max(300).optional(),
  province: z.string().max(120).optional(),
  district: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  postalCode: z.string().max(40).optional(),
  country: z.string().max(120).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  contactPersonName: z.string().max(200).optional(),
  contactPersonRole: z.string().max(120).optional(),
  contactPersonPhone: z.string().max(40).optional(),
  openingHours: z.any().optional(),
  timezone: z.string().max(60).optional(),
  is247: z.boolean().optional(),
  hasDelivery: z.boolean().optional(),
  acceptsInsurance: z.boolean().optional(),
}

export const pharmacyRouter = createTRPCRouter({
  // -----------------------------------------------------------------------
  // Patient/pharmacy directory procedures — UNCHANGED
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // Admin CRUD — org-scoped via factory, enterprise fields included
  // -----------------------------------------------------------------------
  listForAdmin: adminProcedure
    .input(z.object({
      cursor: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(100).default(50),
      q: z.string().max(100).optional(),
      includeArchived: z.boolean().optional(),
    }))
    .query(({ ctx, input }) => crud.list(ctx as never, input)),

  getDetail: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => crud.getDetail(ctx as never, input)),

  create: adminProcedure
    .input(z.object(pharmacyProfileFields))
    .mutation(({ ctx, input }) => crud.create(ctx as never, { ...input, facilityType: 'pharmacy' })),

  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(200),
      logoUrl: z.string().max(500).optional(),
      description: z.string().max(2000).optional(),
      licenseRef: z.string().max(100).optional(),
      registrationAuthority: z.string().max(200).optional(),
      establishedYear: z.number().int().min(1800).max(2100).optional(),
      phone: z.string().max(40).optional(),
      altPhone: z.string().max(40).optional(),
      email: z.string().max(200).optional(),
      website: z.string().max(300).optional(),
      whatsapp: z.string().max(40).optional(),
      address: z.string().max(300).optional(),
      province: z.string().max(120).optional(),
      district: z.string().max(120).optional(),
      city: z.string().max(120).optional(),
      postalCode: z.string().max(40).optional(),
      country: z.string().max(120).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      contactPersonName: z.string().max(200).optional(),
      contactPersonRole: z.string().max(120).optional(),
      contactPersonPhone: z.string().max(40).optional(),
      openingHours: z.any().optional(),
      timezone: z.string().max(60).optional(),
      is247: z.boolean().optional(),
      hasDelivery: z.boolean().optional(),
      acceptsInsurance: z.boolean().optional(),
    }))
    .mutation(({ ctx, input }) => crud.update(ctx as never, input)),

  archive: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => crud.archive(ctx as never, input)),

  restore: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => crud.restore(ctx as never, input)),

  setActive: adminProcedure
    .input(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('pharmacy_facilities')
        .update({ is_active: input.isActive })
        .eq('id', input.id)
        .eq('org_id', ctx.user!.orgId)
        .select('id')
        .maybeSingle()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      if (!data) throw new TRPCError({ code: 'NOT_FOUND' })
      return { id: data.id }
    }),
})
