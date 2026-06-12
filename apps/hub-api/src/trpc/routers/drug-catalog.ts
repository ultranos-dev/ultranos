import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { protectedProcedure, createTRPCRouter } from '../init'
import {
  scopeEntryToTier,
  getTierForRole,
  ENRICHMENT_FIELDS_BY_ROLE,
} from '@/services/drug-catalog.service'
import { AuditLogger } from '@ultranos/audit-logger'
import type { DrugSearchResult } from '@ultranos/shared-types'

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

  // getPrices, setPrice added in Task 9
})
