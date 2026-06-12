import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { protectedProcedure, createTRPCRouter } from '../init'
import {
  scopeEntryToTier,
} from '@/services/drug-catalog.service'
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

  // sync, enrich, getPrices, setPrice added in Tasks 8 & 9
})
