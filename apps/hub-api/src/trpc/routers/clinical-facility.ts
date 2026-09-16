import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { buildFacilityCrud } from './_facility-crud'

const adminProcedure = protectedProcedure.use(async (opts) => {
  if (opts.ctx.user.role !== 'ADMIN') throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' })
  return opts.next(opts)
})

const crud = buildFacilityCrud({
  table: 'clinical_facilities',
  typeColumn: 'facility_type',
  typeValues: ['clinic', 'hospital', 'opd'],
  resourceType: 'CLINICAL_FACILITY',
  extraColumns: ['bed_count', 'departments', 'specialties', 'emergency_services'],
})

const facilityType = z.enum(['clinic', 'hospital', 'opd'])

// All profile fields with name required; all others optional on update
const profileFields = {
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
  bedCount: z.number().int().min(0).optional(),
  departments: z.array(z.string().max(120)).optional(),
  specialties: z.array(z.string().max(120)).optional(),
  emergencyServices: z.boolean().optional(),
}

export const clinicalFacilityRouter = createTRPCRouter({
  listForAdmin: adminProcedure
    .input(z.object({
      facilityTypes: z.array(facilityType).optional(),
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
    .input(z.object({ facilityType, ...profileFields }))
    .mutation(({ ctx, input }) => crud.create(ctx as never, input)),

  // update: id + name required, all other profile fields optional — plain object literal per brief override
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
      bedCount: z.number().int().min(0).optional(),
      departments: z.array(z.string().max(120)).optional(),
      specialties: z.array(z.string().max(120)).optional(),
      emergencyServices: z.boolean().optional(),
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
        .from('clinical_facilities')
        .update({ is_active: input.isActive })
        .eq('id', input.id)
        .eq('org_id', ctx.user.orgId)
        .select('id')
        .maybeSingle()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      if (!data) throw new TRPCError({ code: 'NOT_FOUND' })
      return { id: data.id }
    }),
})
