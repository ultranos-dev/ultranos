import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createHash } from 'crypto'
import { createTRPCRouter, baseProcedure } from '../init'

function sanitizeFilterValue(value: string): string {
  return value.replace(/[,.*()\\]/g, '')
}

function hashNationalId(rawId: string): string {
  return createHash('sha256').update(rawId).digest('hex')
}

/**
 * Patient domain router.
 * Provides patient search for spoke apps (OPD Lite PWA, etc.).
 */
export const patientRouter = createTRPCRouter({
  search: baseProcedure
    .input(
      z.object({
        query: z.string().min(1).max(200),
      })
    )
    .query(async ({ ctx, input }) => {
      // Search patients by name or national ID hash in the Hub database.
      // Uses Supabase RPC or direct query — returns FHIR-aligned patient records.
      // PHI safety: only returns data needed for identity verification.
      const sanitized = sanitizeFilterValue(input.query)
      const idHash = hashNationalId(input.query)

      const { data, error } = await ctx.supabase
        .from('patients')
        .select(
          'id, name, gender, birth_date, birth_year_only, identifier, meta_last_updated, meta_version_id, ultranos_name_local, ultranos_name_latin, ultranos_name_phonetic, ultranos_national_id_hash, ultranos_is_active, ultranos_created_at'
        )
        .or(
          `ultranos_name_local.ilike.%${sanitized}%,ultranos_name_latin.ilike.%${sanitized}%,ultranos_national_id_hash.eq.${idHash}`
        )
        .eq('ultranos_is_active', true)
        .limit(20)

      if (error) {
        // Log error shape only — never log PHI
        console.error('Patient search error:', { code: error.code, hint: error.hint })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Patient search failed',
        })
      }

      return {
        patients: (data ?? []).map((row) => ({
          id: row.id,
          resourceType: 'Patient' as const,
          name: row.name,
          gender: row.gender,
          birthDate: row.birth_date,
          birthYearOnly: row.birth_year_only,
          identifier: row.identifier,
          _ultranos: {
            nameLocal: row.ultranos_name_local,
            nameLatin: row.ultranos_name_latin,
            namePhonetic: row.ultranos_name_phonetic,
            nationalIdHash: row.ultranos_national_id_hash,
            isActive: row.ultranos_is_active,
            createdAt: row.ultranos_created_at,
          },
          meta: {
            lastUpdated: row.meta_last_updated,
            versionId: row.meta_version_id,
          },
        })),
      }
    }),
})
