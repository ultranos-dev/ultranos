import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { generateBlindIndex } from '@ultranos/crypto/server'
import { getFieldEncryptionKeys } from '@/lib/field-encryption'
// NOTE: enforceConsentMiddleware is available for per-patient data endpoints.
// The search endpoint returns identity data for verification (not clinical PHI),
// so consent enforcement is applied at the individual patient data level, not search.
// When per-patient clinical data endpoints are added to this router, apply:
//   .use(enforceConsentMiddleware('Patient'))
// See: apps/hub-api/src/trpc/middleware/enforceConsent.ts

function sanitizeFilterValue(value: string): string {
  // Strip dangerous chars, then escape SQL ILIKE wildcards
  return value
    .replace(/[,.*()\\]/g, '')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

function hashNationalId(rawId: string): string {
  const { hmacKey } = getFieldEncryptionKeys()
  return generateBlindIndex(rawId, hmacKey)
}

/**
 * Patient domain router.
 * Provides patient search for spoke apps (OPD Lite PWA, etc.).
 */
export const patientRouter = createTRPCRouter({
  search: protectedProcedure
    .use(enforceResourceAccess('Patient'))
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

      if (!sanitized.replace(/\\[%_]/g, '').trim()) {
        return { patients: [] }
      }

      // Build OR filter: always search by name, only add national ID hash
      // lookup when the query looks like it could be an ID (alphanumeric).
      // This avoids crashing name-only searches if encryption env vars are missing.
      const nameFilters = `ultranos_name_local.ilike.%${sanitized}%,ultranos_name_latin.ilike.%${sanitized}%`
      let orFilter = nameFilters

      const looksLikeId = /^[a-zA-Z0-9-]+$/.test(input.query.trim())
      if (looksLikeId) {
        try {
          const idHash = hashNationalId(input.query)
          orFilter = `${nameFilters},ultranos_national_id_hash.eq.${idHash}`
        } catch {
          // Encryption keys not configured — skip national ID lookup
        }
      }

      const { data, error } = await ctx.supabase
        .from('patients')
        .select(
          'id, name, gender, birth_date, birth_year_only, identifier, meta_last_updated, meta_version_id, ultranos_name_local, ultranos_name_latin, ultranos_name_phonetic, ultranos_national_id_hash, ultranos_is_active, ultranos_created_at'
        )
        .or(orFilter)
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
