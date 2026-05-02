import { z } from 'zod'
import { protectedProcedure, createTRPCRouter } from '../init'
// db is imported solely for db.fromRowRaw, which is a pure snake_case→camelCase
// transform (wraps toCamelCase — no encryption, no DB coupling). Vocabulary tables
// contain no PHI so the non-decrypting fromRowRaw variant is correct here.
import { db } from '@/lib/supabase'

const vocabularyTypeSchema = z.enum(['medications', 'icd10', 'interactions'])

const TABLE_MAP: Record<z.infer<typeof vocabularyTypeSchema>, string> = {
  medications: 'vocabulary_medications',
  icd10: 'vocabulary_icd10',
  interactions: 'vocabulary_interactions',
}

export const vocabularyRouter = createTRPCRouter({
  /**
   * Vocabulary sync — returns entries updated since a given version.
   * No RBAC restriction — vocabulary is non-PHI, all authenticated users can sync.
   */
  sync: protectedProcedure
    .input(
      z.object({
        type: vocabularyTypeSchema,
        sinceVersion: z.number().int().min(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tableName = TABLE_MAP[input.type]

      const { data, error } = await ctx.supabase
        .from(tableName)
        .select('*')
        .gt('version', input.sinceVersion)
        .order('version', { ascending: true })

      if (error) {
        // Use opaque error code — do not leak table names or Supabase internals
        throw new Error('VOCAB_SYNC_ERROR')
      }

      const entries = (data ?? []).map((row) => db.fromRowRaw(row))

      let latestVersion: number
      if (data && data.length > 0) {
        // Entries are ordered ascending by version — last entry has the highest version.
        // Derive latestVersion from the result set to avoid a second round-trip (P21).
        latestVersion = (data[data.length - 1] as { version: number }).version
      } else {
        // Delta is empty — need a MAX query to tell the client whether it is already
        // up to date or whether sinceVersion is simply ahead of all known entries.
        const { data: maxRow, error: maxError } = await ctx.supabase
          .from(tableName)
          .select('version')
          .order('version', { ascending: false })
          .limit(1)
          .single()

        if (maxError) {
          // No entries were applied, so returning sinceVersion is safe — the client
          // will re-check next sync rather than advancing its watermark incorrectly.
          return { entries: [], latestVersion: input.sinceVersion }
        }

        latestVersion = maxRow?.version ?? input.sinceVersion
      }

      return {
        entries,
        latestVersion,
      }
    }),
})
