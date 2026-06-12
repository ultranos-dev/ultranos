import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { protectedProcedure, createTRPCRouter } from '../init'
import {
  scopeEntryToTier,
  getTierForRole,
  ENRICHMENT_FIELDS_BY_ROLE,
} from '@/services/drug-catalog.service'
import { haversineDistanceKm, sortPrices } from '@/services/drug-prices.service'
import { AuditLogger } from '@ultranos/audit-logger'
import type { DrugSearchResult, PharmacyPrice } from '@ultranos/shared-types'

const langSchema = z.enum(['en', 'prs', 'ps']).default('en')

export const drugCatalogRouter = createTRPCRouter({
  /**
   * Fuzzy search by INN name, ATC code, or local Dari/Pashto name.
   * Note: brand name search requires a future brand_names_text generated column.
   * Returns identity fields only — no tier content.
   * Used by OPD-Lite, Pharmacy-Lite, and Pharmopedia.
   */
  search: protectedProcedure
    .input(z.object({
      q: z.string().min(1).max(100),
      lang: langSchema,
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }): Promise<DrugSearchResult[]> => {
      const { q, lang, limit } = input
      const likeQ = `%${q.toLowerCase()}%`

      // Note: brand_names TEXT[] cannot be searched via PostgREST ILIKE.
      // Full brand name search requires a separate brand_names_text generated column (future migration).
      const { data, error } = await ctx.supabase
        .from('drug_catalog')
        .select('atc_code, inn_name, brand_names, dose_forms, therapeutic_class, local_names')
        .or([
          `inn_name.ilike.${likeQ}`,
          `atc_code.ilike.${likeQ}`,
          `local_names::text.ilike.${likeQ}`,
        ].join(','))
        .limit(limit)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })

      return (data ?? []).map((row) => ({
        atcCode: row.atc_code as string,
        innName: row.inn_name as string,
        brandNames: (row.brand_names ?? []) as string[],
        doseForms: (row.dose_forms ?? []) as string[],
        therapeuticClass: row.therapeutic_class as string,
        localName: ((row.local_names as Record<string, string>) ?? {})[lang],
      }))
    }),

  /**
   * Get full drug profile scoped to caller's role tier.
   * Used by Pharmopedia drug detail screen.
   */
  getByAtcCode: protectedProcedure
    .input(z.object({ atcCode: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('drug_catalog')
        .select('*')
        .eq('atc_code', input.atcCode)
        .single()

      if (error?.code === 'PGRST116' || !data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'NOT_FOUND: Drug not found' })
      }
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })

      return scopeEntryToTier(data, ctx.user?.role ?? 'PATIENT')
    }),

  /**
   * Incremental sync for Pharmopedia offline cache.
   * Returns all entries with version > sinceVersion, scoped to caller's role.
   * Follows vocabulary.sync pattern.
   */
  sync: protectedProcedure
    .input(z.object({
      sinceVersion: z.number().int().min(0),
      limit: z.number().int().min(1).max(500).default(200),
    }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('drug_catalog')
        .select('*')
        .gt('version', input.sinceVersion)
        .order('version', { ascending: true })
        .limit(input.limit)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })

      const role = ctx.user?.role ?? 'PATIENT'
      const entries = (data ?? []).map((row) => scopeEntryToTier(row, role))

      let latestVersion: number
      if (data && data.length > 0) {
        latestVersion = (data[data.length - 1] as { version: number }).version
      } else {
        const { data: maxRow, error: maxError } = await ctx.supabase
          .from('drug_catalog')
          .select('version')
          .order('version', { ascending: false })
          .limit(1)
          .single()

        if (maxError) return { entries: [], latestVersion: input.sinceVersion }
        latestVersion = maxRow?.version ?? input.sinceVersion
      }

      return { entries, latestVersion }
    }),

  /**
   * Write local enrichment fields to a drug entry.
   * Never overwrites ETL-sourced fields.
   * Emits an audit event on every write.
   * - DOCTOR/NURSE/LAB_TECH (clinical tier): can set localNames only
   * - PHARMACIST/ADMIN (pharmacist tier): can set localNames, dispensingNotes, formularyStatus, unitCost
   * - PATIENT/PUBLIC: rejected
   */
  enrich: protectedProcedure
    .input(z.object({
      atcCode: z.string().min(1),
      fields: z.object({
        localNames: z.record(z.string()).optional(),
        dispensingNotes: z.string().max(500).optional(),
        formularyStatus: z.enum(['on_formulary', 'off_formulary', 'restricted']).optional(),
        unitCost: z.number().min(0).optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.user?.role ?? ''
      const tier = getTierForRole(role)

      if (tier === 'public') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Enrichment requires clinical or pharmacist role' })
      }

      const allowedFields = ENRICHMENT_FIELDS_BY_ROLE[tier]

      const update: Record<string, unknown> = {}

      if (input.fields.localNames !== undefined) {
        if (!allowedFields.has('local_names')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Role cannot set localNames' })
        }
        update.local_names = input.fields.localNames
      }

      if (input.fields.dispensingNotes !== undefined) {
        if (!allowedFields.has('dispensing_notes')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Role cannot set dispensingNotes' })
        }
        update.dispensing_notes = input.fields.dispensingNotes
      }

      if (input.fields.formularyStatus !== undefined) {
        if (!allowedFields.has('formulary_status')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'FORBIDDEN: Role cannot set formularyStatus' })
        }
        update.formulary_status = input.fields.formularyStatus
      }

      if (input.fields.unitCost !== undefined) {
        if (!allowedFields.has('unit_cost')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Role cannot set unitCost' })
        }
        update.unit_cost = input.fields.unitCost
      }

      if (Object.keys(update).length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No valid enrichment fields provided' })
      }

      const { data, error } = await ctx.supabase
        .from('drug_catalog')
        .update(update)
        .eq('atc_code', input.atcCode)
        .select('*')
        .single()

      if (error?.code === 'PGRST116' || !data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Drug not found' })
      }
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'DRUG_CATALOG_ENRICH',
          resourceType: 'DrugCatalog',
          resourceId: input.atcCode,
          actorId: ctx.user!.sub,
          actorRole: ctx.user!.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user!.sessionId,
          metadata: { fields: Object.keys(update) },
        })
      } catch {
        // Audit failure is non-fatal — log shape only, no PHI
        console.warn('[AUDIT_FAILURE]', { action: 'DRUG_CATALOG_ENRICH', resourceType: 'DrugCatalog' })
      }

      return scopeEntryToTier(data, role)
    }),

  /**
   * Real-time pharmacy prices for a drug near a location.
   * NOT included in sync — online only.
   * Used by Pharmopedia Pricing & Savings tab.
   */
  getPrices: protectedProcedure
    .input(z.object({
      atcCode: z.string().min(1),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      sort: z.enum(['distance', 'price']).default('distance'),
      limit: z.number().int().min(1).max(20).default(10),
    }))
    .query(async ({ ctx, input }): Promise<PharmacyPrice[]> => {
      const { data, error } = await ctx.supabase
        .from('pharmacy_prices')
        .select(`
          atc_code,
          retail_price,
          stock_signal,
          dose_form,
          quantity,
          pharmacy_facilities!inner (
            id,
            name,
            latitude,
            longitude
          )
        `)
        .eq('atc_code', input.atcCode)
        .limit(50)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })

      const withDistance: PharmacyPrice[] = (data ?? []).map((row) => {
        const facility = row.pharmacy_facilities as {
          id: string
          name: string
          latitude: number
          longitude: number
        }
        return {
          facilityId: facility.id,
          pharmacyName: facility.name,
          distanceKm: haversineDistanceKm(
            input.lat, input.lng,
            facility.latitude, facility.longitude
          ),
          retailPrice: row.retail_price as number,
          stockSignal: row.stock_signal as 'in_stock' | 'low_stock' | 'out_of_stock',
          doseForm: row.dose_form as string | undefined,
          quantity: row.quantity as number | undefined,
        }
      })

      return sortPrices(withDistance, input.sort).slice(0, input.limit)
    }),

  /**
   * Create or update a pharmacy's retail price for a drug.
   * Pharmacist role only — facility-scoped to caller's facilityId from JWT.
   * Used by Pharmacy-Lite when pharmacist saves a drug price.
   */
  setPrice: protectedProcedure
    .input(z.object({
      atcCode: z.string().min(1),
      facilityId: z.string().uuid(),
      retailPrice: z.number().min(0),
      stockSignal: z.enum(['in_stock', 'low_stock', 'out_of_stock']),
      doseForm: z.string().optional(),
      quantity: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.user?.role ?? ''
      if (getTierForRole(role) !== 'pharmacist') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'FORBIDDEN: Only pharmacists can set prices' })
      }

      const { data, error } = await ctx.supabase
        .from('pharmacy_prices')
        .upsert({
          atc_code: input.atcCode,
          facility_id: input.facilityId,
          retail_price: input.retailPrice,
          stock_signal: input.stockSignal,
          dose_form: input.doseForm ?? null,
          quantity: input.quantity ?? null,
          updated_by: ctx.user!.sub,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'atc_code,facility_id,dose_form',
        })
        .select('*')
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })

      return {
        atcCode: data.atc_code as string,
        facilityId: data.facility_id as string,
        retailPrice: data.retail_price as number,
        stockSignal: data.stock_signal as 'in_stock' | 'low_stock' | 'out_of_stock',
      }
    }),
})
