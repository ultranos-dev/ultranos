import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { enforceConsentMiddleware } from '../middleware/enforceConsent'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { generateBlindIndex } from '@ultranos/crypto/server'
import { getFieldEncryptionKeys } from '@/lib/field-encryption'
import { AuditLogger } from '@ultranos/audit-logger'
import { db } from '@/lib/supabase'

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

      // Audit PHI access — patient identity data returned (CLAUDE.md Rule #6)
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PATIENT',
          resourceId: 'patient-search',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { resultCount: (data ?? []).length },
        })
      } catch (auditError) {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'PATIENT', resourceId: 'patient-search' })
      }

      // db.fromRow() not used here: the SELECT only returns identity/demographics columns
      // (name, gender, birth_date, identifiers). No SENSITIVE_FIELDS are queried.
      // The _ultranos namespace fields require custom mapping that doesn't fit db.fromRowRaw().
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

  // ── patient.create ──────────────────────────────────────────
  // Story 16.2 — AC #1, #2, #5, #6
  create: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .input(
      z.object({
        nameLocal: z.string().min(1).max(500),
        nameLatin: z.string().max(500).optional(),
        namePhonetic: z.string().max(500).optional(),
        gender: z.enum(['male', 'female', 'other', 'unknown']).optional(),
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'birthDate must be YYYY-MM-DD').optional(),
        birthYearOnly: z.boolean().optional(),
        telecomPhone: z.string().max(50).optional(),
        nationalId: z.string().min(1).max(200).optional(),
        guardianId: z.string().uuid().optional(),
        consentVersion: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()
      const patientId = crypto.randomUUID()

      // Generate blind index for national ID (AC #2)
      let nationalIdHash: string | null = null
      if (input.nationalId) {
        nationalIdHash = hashNationalId(input.nationalId)

        // Duplicate detection via blind index (AC #6)
        const { data: existing } = await ctx.supabase
          .from('patients')
          .select('id')
          .eq('national_id_hash', nationalIdHash)
          .limit(1)

        if (existing && existing.length > 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A patient with this national ID already exists',
          })
        }
      }

      // Build row with dual-write: plain columns for search + encrypted _enc columns for read.
      // db.toRow() encrypts fields in randomizedFields (the _enc columns) automatically.
      const row = db.toRow({
        id: patientId,
        // Plain columns (searchable, not in encryption config)
        nameLocal: input.nameLocal,
        nameLatin: input.nameLatin ?? null,
        namePhonetic: input.namePhonetic ?? null,
        // Encrypted copies (in encryption config — AES-256-GCM)
        nameLocalEnc: input.nameLocal,
        nameLatinEnc: input.nameLatin ?? null,
        namePhoneticEnc: input.namePhonetic ?? null,
        birthDateEnc: input.birthDate ?? null,
        // Standard fields
        gender: input.gender ?? null,
        birthDate: input.birthDate ?? null,
        birthYearOnly: input.birthYearOnly ?? false,
        telecomPhone: input.telecomPhone ?? null,
        nationalIdHash,
        guardianId: input.guardianId ?? null,
        consentVersion: input.consentVersion ?? null,
        isActive: true,
        createdBy: ctx.user.sub,
        createdAt: now,
        updatedAt: now,
      })

      const { error } = await ctx.supabase
        .from('patients')
        .insert(row)

      if (error) {
        // Check for unique constraint violation on national_id_hash
        if (error.code === '23505' && error.message?.includes('national_id_hash')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A patient with this national ID already exists',
          })
        }
        console.error('Patient create error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create patient',
        })
      }

      // Audit PHI write (CLAUDE.md Rule #6)
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PATIENT',
          resourceId: patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'create' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PATIENT', resourceId: patientId })
      }

      return {
        id: patientId,
        resourceType: 'Patient' as const,
        meta: { lastUpdated: now },
        _ultranos: { createdAt: now },
      }
    }),

  // ── patient.read ────────────────────────────────────────────
  // Story 16.2 — AC #3, #5
  read: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .use(enforceConsentMiddleware('Patient'))
    .input(
      z.object({
        patientId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('patients')
        .select('*')
        .eq('id', input.patientId)
        .eq('is_active', true)
        .single()

      if (error || !data) {
        if (error?.code === 'PGRST116' || !data) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Patient not found',
          })
        }
        console.error('Patient read error:', { code: error?.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to read patient',
        })
      }

      // Decrypt PHI fields via db.fromRow()
      const patient = db.fromRow(data) as Record<string, unknown>

      // Audit PHI read (CLAUDE.md Rule #6)
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PATIENT',
          resourceId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'read' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'PATIENT', resourceId: input.patientId })
      }

      // Return FHIR-aligned patient with _ultranos extensions.
      // Use decrypted _enc fields for PHI, fall back to plain columns if _enc is empty.
      return {
        id: patient.id as string,
        resourceType: 'Patient' as const,
        nameLocal: (patient.nameLocalEnc as string) ?? (patient.nameLocal as string),
        nameLatin: (patient.nameLatinEnc as string) ?? (patient.nameLatin as string | null),
        namePhonetic: (patient.namePhoneticEnc as string) ?? (patient.namePhonetic as string | null),
        gender: patient.gender as string | null,
        birthDate: (patient.birthDateEnc as string) ?? (patient.birthDate as string | null),
        birthYearOnly: patient.birthYearOnly as boolean,
        telecomPhone: patient.telecomPhone as string | null,
        guardianId: patient.guardianId as string | null,
        consentVersion: patient.consentVersion as string | null,
        _ultranos: {
          isActive: patient.isActive as boolean,
          createdBy: patient.createdBy as string | null,
          createdAt: patient.createdAt as string,
          mpiWarn: patient.mpiWarn as boolean,
        },
        meta: {
          lastUpdated: patient.updatedAt as string,
          versionId: (patient.metaVersionId as string) ?? undefined,
        },
      }
    }),

  // ── patient.update ──────────────────────────────────────────
  // Story 16.2 — AC #4, #5
  update: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .input(
      z.object({
        patientId: z.string().uuid(),
        lastKnownUpdate: z.string().min(1),
        nameLocal: z.string().min(1).max(500).optional(),
        nameLatin: z.string().max(500).optional(),
        namePhonetic: z.string().max(500).optional(),
        gender: z.enum(['male', 'female', 'other', 'unknown']).optional(),
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'birthDate must be YYYY-MM-DD').optional(),
        birthYearOnly: z.boolean().optional(),
        telecomPhone: z.string().max(50).optional(),
        nationalId: z.string().min(1).max(200).optional(),
        guardianId: z.string().uuid().nullable().optional(),
        consentVersion: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch current patient for HLC conflict detection
      const { data: current, error: fetchError } = await ctx.supabase
        .from('patients')
        .select('id, updated_at, national_id_hash')
        .eq('id', input.patientId)
        .eq('is_active', true)
        .single()

      if (fetchError || !current) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        })
      }

      // Tier 3 LWW conflict detection — compare client's last-known timestamp against server's updated_at
      if (current.updated_at && input.lastKnownUpdate < current.updated_at) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Stale update — a newer version exists',
        })
      }

      // Build partial update payload from provided fields only
      const updates: Record<string, unknown> = {}
      const fieldsUpdated: string[] = []

      if (input.nameLocal !== undefined) {
        updates.nameLocal = input.nameLocal
        updates.nameLocalEnc = input.nameLocal
        fieldsUpdated.push('nameLocal')
      }
      if (input.nameLatin !== undefined) {
        updates.nameLatin = input.nameLatin
        updates.nameLatinEnc = input.nameLatin
        fieldsUpdated.push('nameLatin')
      }
      if (input.namePhonetic !== undefined) {
        updates.namePhonetic = input.namePhonetic
        updates.namePhoneticEnc = input.namePhonetic
        fieldsUpdated.push('namePhonetic')
      }
      if (input.gender !== undefined) {
        updates.gender = input.gender
        fieldsUpdated.push('gender')
      }
      if (input.birthDate !== undefined) {
        updates.birthDate = input.birthDate
        updates.birthDateEnc = input.birthDate
        fieldsUpdated.push('birthDate')
      }
      if (input.birthYearOnly !== undefined) {
        updates.birthYearOnly = input.birthYearOnly
        fieldsUpdated.push('birthYearOnly')
      }
      if (input.telecomPhone !== undefined) {
        updates.telecomPhone = input.telecomPhone
        fieldsUpdated.push('telecomPhone')
      }
      if (input.guardianId !== undefined) {
        updates.guardianId = input.guardianId
        fieldsUpdated.push('guardianId')
      }
      if (input.consentVersion !== undefined) {
        updates.consentVersion = input.consentVersion
        fieldsUpdated.push('consentVersion')
      }

      // National ID change — re-hash and check duplicates (excluding current patient)
      if (input.nationalId !== undefined) {
        const newHash = hashNationalId(input.nationalId)

        const { data: duplicate } = await ctx.supabase
          .from('patients')
          .select('id')
          .eq('national_id_hash', newHash)
          .neq('id', input.patientId)
          .limit(1)

        if (duplicate && duplicate.length > 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A patient with this national ID already exists',
          })
        }

        updates.nationalIdHash = newHash
        fieldsUpdated.push('nationalId')
      }

      if (fieldsUpdated.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No fields to update',
        })
      }

      updates.updatedAt = new Date().toISOString()
      const row = db.toRow(updates)

      const { data: updated, error: updateError } = await ctx.supabase
        .from('patients')
        .update(row)
        .eq('id', input.patientId)
        .eq('is_active', true)
        .select('id')

      if (updateError) {
        if (updateError.code === '23505' && updateError.message?.includes('national_id_hash')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A patient with this national ID already exists',
          })
        }
        console.error('Patient update error:', { code: updateError.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update patient',
        })
      }

      if (!updated || updated.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found or was deactivated',
        })
      }

      // Audit PHI write (CLAUDE.md Rule #6)
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PATIENT',
          resourceId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'update', fieldsUpdated },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PATIENT', resourceId: input.patientId })
      }

      return {
        id: input.patientId,
        resourceType: 'Patient' as const,
        meta: {
          lastUpdated: updates.updatedAt as string,
        },
      }
    }),
})
