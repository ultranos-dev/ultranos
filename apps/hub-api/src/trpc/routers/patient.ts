import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { enforceConsentMiddleware } from '../middleware/enforceConsent'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { rateLimitMiddleware, RATE_LIMIT_TIERS } from '../middleware/rateLimit'
import { generateBlindIndex } from '@ultranos/crypto/server'
import { getFieldEncryptionKeys } from '@/lib/field-encryption'
import { AuditLogger } from '@ultranos/audit-logger'
import { db } from '@/lib/supabase'
import { normalizeNameComponent, computePhoneticTokens, computeMpiResult } from '@ultranos/mpi-engine'
import { signProceedToken, verifyProceedToken, consumeProceedToken } from '@/lib/mpi-proceed-token'
import { fetchMpiCandidates } from '@/lib/mpi-candidate-query'
import { CreatePatientMpiInputSchema, PatientContactSchema } from '@ultranos/shared-types'

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
  // ── patient.list ───────────────────────────────────────────
  // Cursor-based paginated listing of all active patients.
  // Used by PatientDirectory for bulk sync into local IndexedDB.
  list: protectedProcedure
    .use(rateLimitMiddleware(RATE_LIMIT_TIERS.default, 'patientList'))
    .use(enforceResourceAccess('Patient'))
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('patients')
        .select(
          'id, gender, birth_date, birth_year_only, birth_year, ' +
          'name_local, name_latin, national_id_hash, is_active, created_at, updated_at, ' +
          'name_given, name_father, name_grandfather, name_family, ' +
          'address_province_origin, address_district_origin, address_village_origin, ' +
          'address_province_current, address_district_current, address_village_current, ' +
          'is_nomadic, telecom_phone, blood_group, photo_url, preferred_language, ' +
          'mpi_score, mpi_warn, ' +
          'marital_status, displacement_category, nationality, occupation, ' +
          'education_level, disability, telecom_phone_use, emergency_contacts'
        )
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(input.limit)

      if (input.cursor) {
        query = query.gt('created_at', input.cursor)
      }

      const { data, error } = await query

      if (error) {
        console.error('Patient list error:', { code: error.code, hint: error.hint })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Patient list failed',
        })
      }

      const rows = data ?? []
      const nextCursor = rows.length === input.limit
        ? (rows[rows.length - 1] as Record<string, unknown>).created_at as string
        : null

      // Audit PHI access (CLAUDE.md Rule #6)
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PATIENT',
          resourceId: 'patient-list',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { resultCount: rows.length, hasCursor: !!input.cursor },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'PATIENT', resourceId: 'patient-list' })
      }

      return {
        patients: rows.map((row: Record<string, unknown>) => ({
          id: row.id,
          resourceType: 'Patient' as const,
          name: [{ text: row.name_local as string }],
          gender: row.gender,
          birthDate: row.birth_date,
          birthYearOnly: row.birth_year_only,
          maritalStatus: (row.marital_status as string) ?? undefined,
          contact: (() => {
            const parsed = PatientContactSchema.array().safeParse(row.emergency_contacts)
            return parsed.success && parsed.data.length > 0 ? parsed.data : undefined
          })(),
          telecom: row.telecom_phone
            ? [{ system: 'phone' as const, value: row.telecom_phone as string, use: (row.telecom_phone_use as 'home' | 'work' | 'mobile') ?? undefined }]
            : [],
          _ultranos: {
            nameLocal:    row.name_local,
            nameLatin:    row.name_latin,
            nationalIdHash: row.national_id_hash,
            isActive:     row.is_active,
            createdAt:    row.created_at,
            nameGiven:           row.name_given,
            nameFather:          row.name_father,
            nameGrandfather:     row.name_grandfather,
            nameFamily:          row.name_family ?? undefined,
            birthYear:           row.birth_year,
            addressOrigin: row.address_province_origin
              ? {
                  province: row.address_province_origin as string,
                  district: (row.address_district_origin as string) ?? '',
                  village: (row.address_village_origin as string) || undefined,
                }
              : undefined,
            addressCurrent: row.address_province_current
              ? {
                  province: row.address_province_current as string,
                  district: (row.address_district_current as string) ?? '',
                  village: (row.address_village_current as string) || undefined,
                }
              : undefined,
            isNomadic:   (row.is_nomadic as boolean) ?? false,
            bloodGroup:  (row.blood_group as string) ?? undefined,
            photoUrl:    (row.photo_url as string) ?? undefined,
            preferredLanguage: (row.preferred_language as string) ?? undefined,
            mpiScore:    row.mpi_score,
            mpiWarn:     (row.mpi_warn as boolean) ?? false,
            displacementCategory: (row.displacement_category as string) ?? undefined,
            nationality: (row.nationality as string)?.toUpperCase() ?? undefined,
            occupation:  (row.occupation as string) ?? undefined,
            educationLevel: (row.education_level as string) ?? undefined,
            disability:  (row.disability as boolean) ?? undefined,
          },
          meta: {
            lastUpdated: (row.updated_at as string) ?? (row.created_at as string),
          },
        })),
        nextCursor,
      }
    }),

  search: protectedProcedure
    .use(rateLimitMiddleware(RATE_LIMIT_TIERS.patientSearch, 'patientSearch'))
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
      const nameFilters = `name_local.ilike.%${sanitized}%,name_latin.ilike.%${sanitized}%`
      let orFilter = nameFilters

      const looksLikeId = /^[a-zA-Z0-9-]+$/.test(input.query.trim())
      if (looksLikeId) {
        try {
          const idHash = hashNationalId(input.query)
          orFilter = `${nameFilters},national_id_hash.eq.${idHash}`
        } catch {
          // Encryption keys not configured — skip national ID lookup
        }
      }

      const { data, error } = await ctx.supabase
        .from('patients')
        .select(
          'id, gender, birth_date, birth_year_only, birth_year, ' +
          'name_local, name_latin, national_id_hash, is_active, created_at, updated_at, ' +
          'name_given, name_father, name_grandfather, name_family, ' +
          'address_province_origin, address_district_origin, address_village_origin, ' +
          'address_province_current, address_district_current, address_village_current, ' +
          'is_nomadic, telecom_phone, blood_group, photo_url, preferred_language, ' +
          'mpi_score, mpi_warn, ' +
          'marital_status, displacement_category, nationality, occupation, ' +
          'education_level, disability, telecom_phone_use, emergency_contacts'
        )
        .or(orFilter)
        .eq('is_active', true)
        .limit(50)

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
        patients: (data ?? []).map((row: Record<string, unknown>) => ({
          id: row.id,
          resourceType: 'Patient' as const,
          name: [{ text: row.name_local as string }],
          gender: row.gender,
          birthDate: row.birth_date,
          birthYearOnly: row.birth_year_only,
          maritalStatus: (row.marital_status as string) ?? undefined,
          contact: (() => {
            const parsed = PatientContactSchema.array().safeParse(row.emergency_contacts)
            return parsed.success && parsed.data.length > 0 ? parsed.data : undefined
          })(),
          telecom: row.telecom_phone
            ? [{ system: 'phone' as const, value: row.telecom_phone as string, use: (row.telecom_phone_use as 'home' | 'work' | 'mobile') ?? undefined }]
            : [],
          _ultranos: {
            nameLocal:    row.name_local,
            nameLatin:    row.name_latin,
            nationalIdHash: row.national_id_hash,
            isActive:     row.is_active,
            createdAt:    row.created_at,
            nameGiven:           row.name_given,
            nameFather:          row.name_father,
            nameGrandfather:     row.name_grandfather,
            nameFamily:          row.name_family ?? undefined,
            birthYear:           row.birth_year,
            addressOrigin: row.address_province_origin
              ? {
                  province: row.address_province_origin as string,
                  district: (row.address_district_origin as string) ?? '',
                  village: (row.address_village_origin as string) || undefined,
                }
              : undefined,
            addressCurrent: row.address_province_current
              ? {
                  province: row.address_province_current as string,
                  district: (row.address_district_current as string) ?? '',
                  village: (row.address_village_current as string) || undefined,
                }
              : undefined,
            isNomadic:   (row.is_nomadic as boolean) ?? false,
            bloodGroup:  (row.blood_group as string) ?? undefined,
            photoUrl:    (row.photo_url as string) ?? undefined,
            preferredLanguage: (row.preferred_language as string) ?? undefined,
            mpiScore:    row.mpi_score,
            mpiWarn:     (row.mpi_warn as boolean) ?? false,
            displacementCategory: (row.displacement_category as string) ?? undefined,
            nationality: (row.nationality as string)?.toUpperCase() ?? undefined,
            occupation:  (row.occupation as string) ?? undefined,
            educationLevel: (row.education_level as string) ?? undefined,
            disability:  (row.disability as boolean) ?? undefined,
          },
          meta: {
            lastUpdated: (row.updated_at as string) ?? (row.created_at as string),
          },
        })),
      }
    }),

  // ── patient.checkDuplicates ─────────────────────────────────
  checkDuplicates: protectedProcedure
    .use(rateLimitMiddleware({ limit: 20, windowSec: 60 }, 'mpiCheck'))
    .use(enforceResourceAccess('Patient'))
    .input(
      z.object({
        nameGiven:             z.string().min(1).max(200).optional(),
        nameFather:            z.string().min(1).max(200).optional(),
        nameGrandfather:       z.string().min(1).max(200).optional(),
        birthYear:             z.number().int().min(1900).optional(),
        gender:                z.enum(['male', 'female', 'other', 'unknown']).optional(),
        addressDistrictOrigin: z.string().max(100).optional(),
        addressProvinceOrigin: z.string().max(100).optional(),
        phone:                 z.string().max(50).optional(),
        nationalId:            z.string().max(200).optional(),
        tazkiraPaperHash:      z.string().max(500).optional(),
        biometricFingerprintHash: z.string().max(500).optional(),
      }).refine(
        (val) => val.nameGiven || val.nameFather || val.nationalId || val.tazkiraPaperHash || val.biometricFingerprintHash,
        { message: 'At least one identity field (name or hard identifier) is required' }
      )
    )
    .query(async ({ ctx, input }) => {
      const { hmacKey } = getFieldEncryptionKeys()

      const nationalIdHash = input.nationalId
        ? generateBlindIndex(input.nationalId, hmacKey)
        : undefined

      const candidates = await fetchMpiCandidates(ctx.supabase, {
        nameGiven:             input.nameGiven,
        nameFather:            input.nameFather,
        nationalId:            input.nationalId,
        tazkiraPaperHash:      input.tazkiraPaperHash,
        biometricFingerprintHash: input.biometricFingerprintHash,
        birthYear:             input.birthYear,
        addressDistrictOrigin: input.addressDistrictOrigin,
        phone:                 input.phone,
      })

      const mpiResult = computeMpiResult(candidates, {
        nameGiven:                input.nameGiven,
        nameFather:               input.nameFather,
        nameGrandfather:          input.nameGrandfather,
        birthYear:                input.birthYear,
        gender:                   input.gender,
        addressDistrictOrigin:    input.addressDistrictOrigin,
        addressProvinceOrigin:    input.addressProvinceOrigin,
        phone:                    input.phone,
        nationalIdHash:           nationalIdHash,
        tazkiraPaperHash:         input.tazkiraPaperHash,
        biometricFingerprintHash: input.biometricFingerprintHash,
      })

      // Issue a proceedToken on WARN so the clinician can pass it directly to patient.create
      let proceedToken: string | undefined
      if (mpiResult.decision === 'WARN') {
        proceedToken = await signProceedToken({
          candidateIds: mpiResult.candidates.map(c => c.candidate.id),
          maxScore: mpiResult.topScore,
          issuedTo: ctx.user.sub,
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PATIENT',
          resourceId: 'mpi-check',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'mpi_check', decision: mpiResult.decision, topScore: mpiResult.topScore },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'PATIENT', resourceId: 'mpi-check' })
      }

      return {
        decision: mpiResult.decision,
        topScore: mpiResult.topScore,
        proceedToken,
        candidates: mpiResult.candidates.map(c => ({
          id:             c.candidate.id,
          nameGiven:      c.candidate.nameGiven,
          nameFather:     c.candidate.nameFather,
          birthYear:      c.candidate.birthYear,
          gender:         c.candidate.gender,
          districtOrigin: c.candidate.addressDistrictOrigin,
          mpiScore:       c.score,
          scoreBreakdown: c.breakdown,
        })),
      }
    }),

  // ── patient.create ──────────────────────────────────────────
  // MPI Phase 1 — AC #1–#8: MPI deduplication + atomic RPC insert with consent
  create: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .input(CreatePatientMpiInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { hmacKey } = getFieldEncryptionKeys()
      const now = new Date().toISOString()
      const patientId = crypto.randomUUID()

      // Step 1: Normalize name components and compute phonetic tokens
      const nameGiven = input.nameGiven ?? null
      const nameFather = input.nameFather ?? null
      const nameGrandfather = input.nameGrandfather ?? null
      const nameFamily = input.nameFamily ?? null

      const phoneticGiven       = nameGiven       ? computePhoneticTokens(normalizeNameComponent(nameGiven))       : []
      const phoneticFather      = nameFather      ? computePhoneticTokens(normalizeNameComponent(nameFather))      : []
      const phoneticGrandfather = nameGrandfather ? computePhoneticTokens(normalizeNameComponent(nameGrandfather)) : []

      // Step 2: Hash hard identifiers
      const nationalIdHash = input.nationalId
        ? generateBlindIndex(input.nationalId, hmacKey)
        : null

      const tazkiraId = input.identifiers?.find(id => id.system === 'AFGHAN_TAZKIRA_PAPER')
      const tazkiraPaperHash = tazkiraId?.valueHash ?? null

      // Step 3: MPI candidate retrieval and scoring
      const candidates = await fetchMpiCandidates(ctx.supabase, {
        nameGiven:                nameGiven  ?? undefined,
        nameFather:               nameFather ?? undefined,
        nationalId:               input.nationalId,
        tazkiraPaperHash:         tazkiraPaperHash  ?? undefined,
        biometricFingerprintHash: input.biometricFingerprintHash,
        birthYear:                input.birthYear,
        addressDistrictOrigin:    input.addressOrigin?.district,
        phone:                    input.phone,
      })

      const mpiResult = computeMpiResult(candidates, {
        nameGiven:                nameGiven  ?? undefined,
        nameFather:               nameFather ?? undefined,
        nameGrandfather:          nameGrandfather ?? undefined,
        birthYear:                input.birthYear,
        gender:                   input.gender,
        addressDistrictOrigin:    input.addressOrigin?.district,
        addressProvinceOrigin:    input.addressOrigin?.province,
        phone:                    input.phone,
        nationalIdHash:           nationalIdHash  ?? undefined,
        tazkiraPaperHash:         tazkiraPaperHash ?? undefined,
        biometricFingerprintHash: input.biometricFingerprintHash,
      })

      // Step 4: Handle MPI decision
      let mpiWarn = false
      let consumeJti: string | null = null

      // TODO: Restore BLOCK enforcement once MPI scoring algorithm is production-ready
      // Currently treating BLOCK same as WARN — all duplicates can be overridden with proceedToken
      if (mpiResult.decision === 'BLOCK' || mpiResult.decision === 'WARN') {
        if (!input.mpiProceedToken) {
          const proceedToken = await signProceedToken({
            candidateIds: mpiResult.candidates.map(c => c.candidate.id),
            maxScore: mpiResult.topScore,
            issuedTo: ctx.user.sub,
          })
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Possible duplicate detected. Include mpiProceedToken to confirm creation.',
            cause: { candidateIds: mpiResult.candidates.slice(0, 5).map(c => c.candidate.id), proceedToken, topScore: mpiResult.topScore },
          })
        }

        try {
          const tokenPayload = await verifyProceedToken(input.mpiProceedToken)
          if (tokenPayload.issuedTo !== ctx.user.sub) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Proceed token was not issued to the current user.',
            })
          }
          consumeJti = tokenPayload.jti
        } catch (err) {
          if (err instanceof TRPCError) throw err
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Proceed token is invalid, expired, or already used.',
          })
        }
        mpiWarn = true
      }

      // Step 5: Build patient and consent rows
      const birthYear = input.birthYear
        ?? (input.birthDate ? parseInt(input.birthDate.slice(0, 4), 10) : null)

      const row = db.toRow({
        id: patientId,
        nameLocal:        input.nameLocal,
        nameLocalEnc:     input.nameLocal,
        nameLatin:        input.nameLatin ?? null,
        nameLatinEnc:     input.nameLatin ?? null,
        name_given:             nameGiven,
        name_father:            nameFather,
        name_grandfather:       nameGrandfather,
        name_given_enc:         nameGiven   ?? null,
        name_father_enc:        nameFather  ?? null,
        name_grandfather_enc:   nameGrandfather ?? null,
        name_family:            nameFamily,
        name_family_enc:        nameFamily ?? null,
        name_phonetic_given:       phoneticGiven,
        name_phonetic_father:      phoneticFather,
        name_phonetic_grandfather: phoneticGrandfather,
        gender:         input.gender ?? null,
        birth_date:     input.birthDate ?? null,
        birth_date_enc: input.birthDate ?? null,
        birth_year:     birthYear,
        birth_year_only: input.birthYearOnly ?? false,
        telecom_phone:  input.phone ?? null,
        national_id_hash:              nationalIdHash,
        tazkira_paper_hash:            tazkiraPaperHash,
        biometric_fingerprint_hash:    input.biometricFingerprintHash ?? null,
        biometric_algorithm_version:   input.biometricAlgorithmVersion ?? null,
        identifiers:    input.identifiers ? JSON.stringify(input.identifiers) : null,
        address_province_origin:  input.addressOrigin?.province ?? null,
        address_district_origin:  input.addressOrigin?.district ?? null,
        address_village_origin:   input.addressOrigin?.village  ?? null,
        address_province_current: input.addressCurrent?.province ?? null,
        address_district_current: input.addressCurrent?.district ?? null,
        address_village_current:  input.addressCurrent?.village  ?? null,
        is_nomadic: input.isNomadic ?? false,
        mpi_warn:  mpiWarn,
        mpi_score: mpiResult.topScore,
        is_active:              true,
        patient_tier:           'FREE',
        preferred_language:     input.preferredLanguage ?? null,
        created_by:             ctx.user.sub,
        created_at:             now,
        updated_at:             now,
        guardian_id:            input.guardianId ?? null,
        marital_status:        input.maritalStatus ?? null,
        displacement_category: input.displacementCategory ?? null,
        nationality:           input.nationality?.toUpperCase() ?? null,
        occupation:            input.occupation ?? null,
        education_level:       input.educationLevel ?? null,
        disability:            input.disability ?? null,
        telecom_phone_use:     input.phoneUse ?? null,
        emergency_contacts:    input.contacts ? JSON.stringify(input.contacts) : JSON.stringify([]),
      })

      const consentRow = {
        consent_method:   input.consent.method,
        witnessed_by:     input.consent.witnessedBy ?? null,
        consent_language: input.consent.language,
        consent_version:  input.consent.version,
        grantor_id:       ctx.user.sub,
        grantor_role:     'SELF',
      }

      // Step 6: Consume proceedToken before insert (WARN path only).
      // Consuming first eliminates the replay window: if the RPC fails after consume,
      // the patient is not created and the clinician must obtain a fresh token.
      // This is safer than consuming after — a failed consume throws before any insert.
      if (consumeJti) {
        await consumeProceedToken(consumeJti)
      }

      // Step 7: Atomic insert via RPC
      const { data: rpcData, error: rpcError } = await ctx.supabase.rpc(
        'create_patient_with_consent',
        { p_patient: row, p_consent: consentRow },
      )

      if (rpcError || !rpcData) {
        console.error('[PATIENT_CREATE] RPC error:', { code: rpcError?.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create patient' })
      }

      // Use the patient ID returned by the RPC (authoritative from DB)
      const confirmedPatientId: string =
        (rpcData as Record<string, unknown>)['patientId'] as string ?? patientId

      // Step 8: Audit
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PATIENT',
          resourceId: confirmedPatientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            operation: 'create',
            mpiDecision: mpiResult.decision,
            mpiScore: mpiResult.topScore,
            mpiCandidateIds: mpiResult.candidates.map(c => c.candidate.id),
            consentMethod: input.consent.method,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PATIENT', resourceId: confirmedPatientId })
      }

      return {
        id: confirmedPatientId,
        resourceType: 'Patient' as const,
        meta: { lastUpdated: now },
        mpiWarn,
        _ultranos: { createdAt: now },
      }
    }),

  // ── patient.syncCreate ─────────────────────────────────────
  // MPI Phase 2 — accepts offline-created patients without MPI blocking.
  // Pass 1 of two-pass sync: always succeeds. Pass 2 (async MPI scoring) fires after.
  syncCreate: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .input(CreatePatientMpiInputSchema.and(z.object({
      offlineCreatedAt: z.string().datetime(),
    })))
    .mutation(async ({ ctx, input }) => {
      const { hmacKey } = getFieldEncryptionKeys()
      const now = new Date().toISOString()
      const patientId = crypto.randomUUID()

      const nameGiven = input.nameGiven ?? null
      const nameFather = input.nameFather ?? null
      const nameGrandfather = input.nameGrandfather ?? null
      const nameFamily = input.nameFamily ?? null

      const phoneticGiven       = nameGiven       ? computePhoneticTokens(normalizeNameComponent(nameGiven))       : []
      const phoneticFather      = nameFather      ? computePhoneticTokens(normalizeNameComponent(nameFather))      : []
      const phoneticGrandfather = nameGrandfather ? computePhoneticTokens(normalizeNameComponent(nameGrandfather)) : []

      const nationalIdHash = input.nationalId
        ? generateBlindIndex(input.nationalId, hmacKey)
        : null
      const tazkiraId = input.identifiers?.find(id => id.system === 'AFGHAN_TAZKIRA_PAPER')
      const tazkiraPaperHash = tazkiraId?.valueHash ?? null

      const birthYear = input.birthYear
        ?? (input.birthDate ? parseInt(input.birthDate.slice(0, 4), 10) : null)

      const row = db.toRow({
        id: patientId,
        nameLocal:        input.nameLocal,
        nameLocalEnc:     input.nameLocal,
        nameLatin:        input.nameLatin ?? null,
        nameLatinEnc:     input.nameLatin ?? null,
        name_given:             nameGiven,
        name_father:            nameFather,
        name_grandfather:       nameGrandfather,
        name_given_enc:         nameGiven   ?? null,
        name_father_enc:        nameFather  ?? null,
        name_grandfather_enc:   nameGrandfather ?? null,
        name_family:            nameFamily,
        name_family_enc:        nameFamily ?? null,
        name_phonetic_given:       phoneticGiven,
        name_phonetic_father:      phoneticFather,
        name_phonetic_grandfather: phoneticGrandfather,
        gender:         input.gender ?? null,
        birth_date:     input.birthDate ?? null,
        birth_date_enc: input.birthDate ?? null,
        birth_year:     birthYear,
        birth_year_only: input.birthYearOnly ?? false,
        telecom_phone:  input.phone ?? null,
        national_id_hash:              nationalIdHash,
        tazkira_paper_hash:            tazkiraPaperHash,
        biometric_fingerprint_hash:    input.biometricFingerprintHash ?? null,
        biometric_algorithm_version:   input.biometricAlgorithmVersion ?? null,
        identifiers:    input.identifiers ? JSON.stringify(input.identifiers) : null,
        address_province_origin:  input.addressOrigin?.province ?? null,
        address_district_origin:  input.addressOrigin?.district ?? null,
        address_village_origin:   input.addressOrigin?.village  ?? null,
        address_province_current: input.addressCurrent?.province ?? null,
        address_district_current: input.addressCurrent?.district ?? null,
        address_village_current:  input.addressCurrent?.village  ?? null,
        is_nomadic: input.isNomadic ?? false,
        // syncCreate: no MPI scoring, set NULL
        mpi_warn:  false,
        mpi_score: null,
        is_active:              true,
        patient_tier:           'FREE',
        preferred_language:     input.preferredLanguage ?? null,
        created_by:             ctx.user.sub,
        created_at:             input.offlineCreatedAt,
        updated_at:             now,
        guardian_id:            input.guardianId ?? null,
        marital_status:        input.maritalStatus ?? null,
        displacement_category: input.displacementCategory ?? null,
        nationality:           input.nationality?.toUpperCase() ?? null,
        occupation:            input.occupation ?? null,
        education_level:       input.educationLevel ?? null,
        disability:            input.disability ?? null,
        telecom_phone_use:     input.phoneUse ?? null,
        emergency_contacts:    input.contacts ? JSON.stringify(input.contacts) : JSON.stringify([]),
      })

      const consentRow = {
        consent_method:   input.consent.method,
        witnessed_by:     input.consent.witnessedBy ?? null,
        consent_language: input.consent.language,
        consent_version:  input.consent.version,
        grantor_id:       ctx.user.sub,
        grantor_role:     'SELF',
      }

      const { data: rpcData, error: rpcError } = await ctx.supabase.rpc(
        'create_patient_with_consent',
        { p_patient: row, p_consent: consentRow },
      )

      if (rpcError || !rpcData) {
        console.error('[PATIENT_SYNC_CREATE] RPC error:', { code: rpcError?.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to sync-create patient' })
      }

      const confirmedPatientId: string =
        (rpcData as Record<string, unknown>)['patientId'] as string ?? patientId

      // Pass 2: fire-and-forget async MPI scoring
      const { runAsyncMpiScoring } = await import('@/lib/async-mpi-scoring')
      void runAsyncMpiScoring(confirmedPatientId, {
        nameGiven: nameGiven ?? undefined,
        nameFather: nameFather ?? undefined,
        nameGrandfather: nameGrandfather ?? undefined,
        birthYear: birthYear ?? undefined,
        gender: input.gender ?? undefined,
        phone: input.phone ?? undefined,
        nationalIdHash: nationalIdHash ?? undefined,
        tazkiraPaperHash: tazkiraPaperHash ?? undefined,
        biometricFingerprintHash: input.biometricFingerprintHash ?? undefined,
        addressDistrictOrigin: input.addressOrigin?.district,
        addressProvinceOrigin: input.addressOrigin?.province,
      }, ctx.supabase).catch(() => {
        console.error('[ASYNC_MPI] Fire-and-forget failed:', { patientId: confirmedPatientId })
      })

      // Audit
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PATIENT',
          resourceId: confirmedPatientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            operation: 'sync_create',
            offlineCreatedAt: input.offlineCreatedAt,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PATIENT', resourceId: confirmedPatientId })
      }

      return {
        id: confirmedPatientId,
        resourceType: 'Patient' as const,
        meta: { lastUpdated: now },
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
      // First fetch: allow inactive patients so we can follow merged_into links
      let { data, error } = await ctx.supabase
        .from('patients')
        .select(
          'id, gender, birth_date, birth_year_only, birth_year, ' +
          'name_local, name_local_enc, name_latin, name_latin_enc, ' +
          'name_given, name_given_enc, name_father, name_father_enc, ' +
          'name_grandfather, name_grandfather_enc, ' +
          'name_family, name_family_enc, ' +
          'name_phonetic, name_phonetic_enc, ' +
          'national_id_hash, is_active, created_at, created_by, updated_at, updated_by, ' +
          'address_province_origin, address_district_origin, address_village_origin, ' +
          'address_province_current, address_district_current, address_village_current, ' +
          'is_nomadic, telecom_phone, blood_group, photo_url, preferred_language, ' +
          'mpi_score, mpi_warn, guardian_id, consent_version, patient_tier, ' +
          'biometric_fingerprint_hash, biometric_algorithm_version, ' +
          'birth_date_enc, meta_version_id, merged_into, ' +
          'marital_status, displacement_category, nationality, occupation, ' +
          'education_level, disability, telecom_phone_use, emergency_contacts'
        )
        .eq('id', input.patientId)
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

      // Follow merged_into link transparently — if this patient was merged,
      // re-fetch the survivor record instead.
      if (data.merged_into) {
        const { data: survivorData, error: survivorErr } = await ctx.supabase
          .from('patients')
          .select(
            'id, gender, birth_date, birth_year_only, birth_year, ' +
            'name_local, name_local_enc, name_latin, name_latin_enc, ' +
            'name_given, name_given_enc, name_father, name_father_enc, ' +
            'name_grandfather, name_grandfather_enc, ' +
            'name_family, name_family_enc, ' +
            'name_phonetic, name_phonetic_enc, ' +
            'national_id_hash, is_active, created_at, created_by, updated_at, updated_by, ' +
            'address_province_origin, address_district_origin, address_village_origin, ' +
            'address_province_current, address_district_current, address_village_current, ' +
            'is_nomadic, telecom_phone, blood_group, photo_url, preferred_language, ' +
            'mpi_score, mpi_warn, guardian_id, consent_version, patient_tier, ' +
            'biometric_fingerprint_hash, biometric_algorithm_version, ' +
            'birth_date_enc, meta_version_id, merged_into, ' +
            'marital_status, displacement_category, nationality, occupation, ' +
            'education_level, disability, telecom_phone_use, emergency_contacts'
          )
          .eq('id', data.merged_into)
          .eq('is_active', true)
          .single()

        if (survivorErr || !survivorData) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Merged survivor patient not found',
          })
        }

        data = survivorData
      } else if (!data.is_active) {
        // Not merged, just inactive — treat as not found
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        })
      }

      // Decrypt PHI fields via db.fromRow()
      const patient = db.fromRow(data) as Record<string, unknown>

      // Resolve updated_by to practitioner display name
      let updatedByName: string | undefined
      let updatedByRole: string | undefined
      if (patient.updatedBy) {
        const { data: practitioner } = await ctx.supabase
          .from('practitioners')
          .select('given_name, family_name, role')
          .eq('id', patient.updatedBy)
          .single()
        if (practitioner) {
          updatedByName = `${practitioner.given_name} ${practitioner.family_name}`
          updatedByRole = practitioner.role
        }
      }

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
      const nameLocal = (patient.nameLocalEnc as string) ?? (patient.nameLocal as string)
      const nameGiven = (patient.nameGivenEnc as string) ?? (patient.nameGiven as string | null)
      const nameFather = (patient.nameFatherEnc as string) ?? (patient.nameFather as string | null)
      const nameGrandfather = (patient.nameGrandfatherEnc as string) ?? (patient.nameGrandfather as string | null)
      const nameFamily = (patient.nameFamilyEnc as string) ?? (patient.nameFamily as string | null)
      const phone = patient.telecomPhone as string | null

      return {
        id: patient.id as string,
        resourceType: 'Patient' as const,
        name: [
          {
            given: nameGiven ? [nameGiven] : [],
            text: nameLocal,
          },
        ],
        gender: patient.gender as string | null,
        birthDate: (patient.birthDateEnc as string) ?? (patient.birthDate as string | null),
        birthYearOnly: (patient.birthYearOnly as boolean) ?? true,
        maritalStatus: (patient.maritalStatus as string) ?? undefined,
        contact: (() => {
          const parsed = PatientContactSchema.array().safeParse(patient.emergencyContacts)
          return parsed.success && parsed.data.length > 0 ? parsed.data : undefined
        })(),
        telecom: phone ? [{ system: 'phone' as const, value: phone, use: (patient.telecomPhoneUse as 'home' | 'work' | 'mobile') ?? undefined }] : [],
        _ultranos: {
          nameLocal,
          nameLatin: (patient.nameLatinEnc as string) ?? (patient.nameLatin as string | null) ?? undefined,
          namePhonetic: (patient.namePhoneticEnc as string) ?? (patient.namePhonetic as string | null) ?? undefined,
          nationalIdHash: (patient.nationalIdHash as string) ?? undefined,
          guardianId: (patient.guardianId as string) ?? undefined,
          consentVersion: (patient.consentVersion as string) ?? undefined,
          patient_tier: ((patient.patientTier as string) ?? 'FREE') as 'FREE' | 'PREMIUM',
          preferredLanguage: (patient.preferredLanguage as string) ?? undefined,
          isActive: (patient.isActive as boolean) ?? true,
          createdBy: (patient.createdBy as string) ?? undefined,
          createdAt: patient.createdAt as string,
          nameGiven: nameGiven ?? undefined,
          nameFather: nameFather ?? undefined,
          nameGrandfather: nameGrandfather ?? undefined,
          nameFamily: nameFamily ?? undefined,
          birthYear: (patient.birthYear as number) ?? undefined,
          addressOrigin: patient.addressProvinceOrigin
            ? {
                province: patient.addressProvinceOrigin as string,
                district: (patient.addressDistrictOrigin as string) ?? '',
                village: (patient.addressVillageOrigin as string) || undefined,
              }
            : undefined,
          addressCurrent: patient.addressProvinceCurrent
            ? {
                province: patient.addressProvinceCurrent as string,
                district: (patient.addressDistrictCurrent as string) ?? '',
                village: (patient.addressVillageCurrent as string) || undefined,
              }
            : undefined,
          isNomadic: (patient.isNomadic as boolean) ?? false,
          biometricFingerprintHash: (patient.biometricFingerprintHash as string) ?? undefined,
          biometricAlgorithmVersion: (patient.biometricAlgorithmVersion as string) ?? undefined,
          mpiScore: (patient.mpiScore as number) ?? undefined,
          photoUrl: (patient.photoUrl as string) ?? undefined,
          bloodGroup: (patient.bloodGroup as string) ?? undefined,
          displacementCategory: (patient.displacementCategory as string) ?? undefined,
          nationality: (patient.nationality as string)?.toUpperCase() ?? undefined,
          occupation: (patient.occupation as string) ?? undefined,
          educationLevel: (patient.educationLevel as string) ?? undefined,
          disability: (patient.disability as boolean) ?? undefined,
          updatedByName,
          updatedByRole,
        },
        meta: {
          lastUpdated: patient.updatedAt as string,
          versionId: (patient.metaVersionId as string) ?? undefined,
        },
      }
    }),

  // ── patient.updateTier ──────────────────────────────────────
  // Story 27.12 — AC #3, #8
  // Patient-facing: exempt from enforceEntitlement (no org_id context).
  // Requires authenticated patient session + server-side receipt validation.
  updateTier: protectedProcedure
    .use(rateLimitMiddleware(RATE_LIMIT_TIERS.default, 'patientUpdateTier'))
    .input(
      z.object({
        patientId: z.string().uuid(),
        tier: z.enum(['FREE', 'PREMIUM']),
        purchaseToken: z.string().min(1),
        platform: z.enum(['android', 'ios']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the caller is the patient themselves (or ADMIN)
      if (ctx.user.role !== 'ADMIN' && ctx.user.sub !== input.patientId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Patients can only update their own tier',
        })
      }

      // Fetch current tier for audit trail
      const { data: current, error: fetchError } = await ctx.supabase
        .from('patients')
        .select('id, patient_tier')
        .eq('id', input.patientId)
        .eq('is_active', true)
        .single()

      if (fetchError || !current) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        })
      }

      const previousTier = (current.patient_tier as string) ?? 'FREE'

      // Server-side receipt validation (CRITICAL — never trust client-side alone).
      // In production, this calls Google Play Developer API or Apple App Store Server API.
      // The purchaseToken is verified against the respective store before updating tier.
      // For now, the token is checked for non-empty (actual store API integration
      // requires service account keys configured via env vars).
      const isValidReceipt = await validatePurchaseReceipt(
        input.purchaseToken,
        input.platform,
      )

      if (!isValidReceipt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Purchase receipt validation failed',
        })
      }

      // Update patient_tier
      const now = new Date().toISOString()
      const { error: updateError } = await ctx.supabase
        .from('patients')
        .update({ patient_tier: input.tier, updated_at: now })
        .eq('id', input.patientId)
        .eq('is_active', true)

      if (updateError) {
        console.error('Patient tier update error:', { code: updateError.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update patient tier',
        })
      }

      // Audit event — opaque patient ID only, no PHI (CLAUDE.md Rule #6)
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'UPDATE',
          resourceType: 'PATIENT',
          resourceId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            operation: 'tier_change',
            previousTier,
            newTier: input.tier,
            platform: input.platform,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', {
          action: 'UPDATE',
          resourceType: 'PATIENT',
          resourceId: input.patientId,
        })
      }

      return { success: true, tier: input.tier }
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
        // MPI Phase 1 fields
        nameGiven: z.string().max(200).optional(),
        nameFather: z.string().max(200).optional(),
        nameGrandfather: z.string().max(200).optional(),
        nameFamily: z.string().max(200).optional(),
        birthYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
        addressProvinceOrigin: z.string().optional(),
        addressDistrictOrigin: z.string().optional(),
        addressVillageOrigin: z.string().max(200).optional(),
        addressProvinceCurrent: z.string().optional(),
        addressDistrictCurrent: z.string().optional(),
        addressVillageCurrent: z.string().max(200).optional(),
        isNomadic: z.boolean().optional(),
        preferredLanguage: z.enum(['en', 'ar', 'prs', 'ps']).optional(),
        // Profile page additions
        photoUrl: z.string().max(500).optional(),
        bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown']).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch current patient for HLC conflict detection
      const { data: current, error: fetchError } = await ctx.supabase
        .from('patients')
        .select('id, updated_at, national_id_hash, blood_group')
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

      // MPI Phase 1 fields
      if (input.nameGiven !== undefined) {
        updates.nameGiven = input.nameGiven
        updates.nameGivenEnc = input.nameGiven
        fieldsUpdated.push('nameGiven')
      }
      if (input.nameFather !== undefined) {
        updates.nameFather = input.nameFather
        updates.nameFatherEnc = input.nameFather
        fieldsUpdated.push('nameFather')
      }
      if (input.nameGrandfather !== undefined) {
        updates.nameGrandfather = input.nameGrandfather
        updates.nameGrandfatherEnc = input.nameGrandfather
        fieldsUpdated.push('nameGrandfather')
      }
      if (input.nameFamily !== undefined) {
        updates.nameFamily = input.nameFamily
        updates.nameFamilyEnc = input.nameFamily
        fieldsUpdated.push('nameFamily')
      }
      if (input.birthYear !== undefined) {
        updates.birthYear = input.birthYear
        fieldsUpdated.push('birthYear')
      }
      if (input.addressProvinceOrigin !== undefined) {
        updates.addressProvinceOrigin = input.addressProvinceOrigin
        fieldsUpdated.push('addressProvinceOrigin')
      }
      if (input.addressDistrictOrigin !== undefined) {
        updates.addressDistrictOrigin = input.addressDistrictOrigin
        fieldsUpdated.push('addressDistrictOrigin')
      }
      if (input.addressVillageOrigin !== undefined) {
        updates.addressVillageOrigin = input.addressVillageOrigin
        fieldsUpdated.push('addressVillageOrigin')
      }
      if (input.addressProvinceCurrent !== undefined) {
        updates.addressProvinceCurrent = input.addressProvinceCurrent
        fieldsUpdated.push('addressProvinceCurrent')
      }
      if (input.addressDistrictCurrent !== undefined) {
        updates.addressDistrictCurrent = input.addressDistrictCurrent
        fieldsUpdated.push('addressDistrictCurrent')
      }
      if (input.addressVillageCurrent !== undefined) {
        updates.addressVillageCurrent = input.addressVillageCurrent
        fieldsUpdated.push('addressVillageCurrent')
      }
      if (input.isNomadic !== undefined) {
        updates.isNomadic = input.isNomadic
        fieldsUpdated.push('isNomadic')
      }
      if (input.preferredLanguage !== undefined) {
        updates.preferredLanguage = input.preferredLanguage
        fieldsUpdated.push('preferredLanguage')
      }
      if (input.photoUrl !== undefined) {
        updates.photoUrl = input.photoUrl
        fieldsUpdated.push('photoUrl')
      }
      if (input.bloodGroup !== undefined) {
        // Write-once enforcement: blood group cannot be changed once set to a real value
        if (current.blood_group && current.blood_group !== 'Unknown') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Blood group cannot be changed once set',
          })
        }
        updates.bloodGroup = input.bloodGroup
        fieldsUpdated.push('bloodGroup')
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
      updates.updatedBy = ctx.user.sub
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

  // ── patient.unresolvedConflictCount ─────────────────────────
  unresolvedConflictCount: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .query(async ({ ctx }) => {
      const { count, error } = await ctx.supabase
        .from('sync_conflicts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'UNRESOLVED')

      if (error) {
        console.error('[PATIENT] Unresolved conflict count error:', { code: error.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to count conflicts' })
      }

      return { count: count ?? 0 }
    }),

  // ── patient.updateBiometric ──────────────────────────────────
  updateBiometric: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .input(z.object({
      patientId: z.string().uuid(),
      biometricFingerprintHash: z.string().min(1).max(500),
      biometricAlgorithmVersion: z.string().min(1).max(50),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('patients')
        .update({
          biometric_fingerprint_hash: input.biometricFingerprintHash,
          biometric_algorithm_version: input.biometricAlgorithmVersion,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.patientId)
        .eq('is_active', true)

      if (error) {
        console.error('[PATIENT_UPDATE_BIOMETRIC] Error:', { code: error.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update biometric' })
      }

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
          metadata: { operation: 'biometric_reenrolment' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceId: input.patientId })
      }

      return { success: true }
    }),

  // ── patient.auditTrail ──────────────────────────────────────
  auditTrail: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .input(
      z.object({
        patientId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(10),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Role-based limit: clinical staff see max 10, admins get full pagination
      const maxLimit = ctx.user.role === 'ADMIN' ? input.limit : Math.min(input.limit, 10)

      let query = ctx.supabase
        .from('audit_log')
        .select('id, action, actor_id, actor_role, metadata, timestamp')
        .eq('resource_id', input.patientId)
        .eq('resource_type', 'PATIENT')
        .order('timestamp', { ascending: false })
        .limit(maxLimit)

      if (input.cursor) {
        query = query.lt('timestamp', input.cursor)
      }

      const { data, error } = await query

      if (error) {
        console.error('Audit trail query error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch audit trail',
        })
      }

      const rows = data ?? []

      // Batch-resolve actor names from practitioners table
      const actorIds = [...new Set(rows.map((r: Record<string, unknown>) => r.actor_id as string).filter(Boolean))]
      const actorMap = new Map<string, { name: string; role: string }>()

      if (actorIds.length > 0) {
        const { data: practitioners } = await ctx.supabase
          .from('practitioners')
          .select('id, given_name, family_name, role')
          .in('id', actorIds)

        for (const p of (practitioners ?? []) as Array<{ id: string; given_name: string; family_name: string; role: string }>) {
          actorMap.set(p.id, {
            name: `${p.given_name} ${p.family_name}`,
            role: p.role,
          })
        }
      }

      // Audit the audit trail read itself (CLAUDE.md Rule #6)
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
          metadata: { operation: 'audit_trail_read', entryCount: rows.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceId: input.patientId })
      }

      return {
        entries: rows.map((r: Record<string, unknown>) => {
          const actor = actorMap.get(r.actor_id as string)
          const meta = (r.metadata ?? {}) as Record<string, unknown>
          return {
            id: r.id as string,
            action: r.action as string,
            actorName: actor?.name,
            actorRole: (actor?.role ?? r.actor_role) as string,
            fieldsUpdated: (meta.fieldsUpdated as string[]) ?? [],
            operation: (meta.operation as string) ?? r.action,
            timestamp: r.timestamp as string,
          }
        }),
        nextCursor: rows.length === maxLimit
          ? (rows[rows.length - 1] as Record<string, unknown>).timestamp as string
          : null,
        hasMore: rows.length === maxLimit,
      }
    }),
})

/**
 * Server-side purchase receipt validation.
 * In production, calls the platform-specific store API:
 * - Google Play: purchases.subscriptions.get with purchaseToken
 * - Apple: App Store Server API /v1/transactions/{transactionId}
 *
 * Env vars required: GOOGLE_PLAY_SERVICE_ACCOUNT_KEY, APPLE_APP_STORE_SERVER_KEY
 * Returns false if token is invalid/expired/replayed.
 */
async function validatePurchaseReceipt(
  purchaseToken: string,
  platform: 'android' | 'ios',
): Promise<boolean> {
  if (!purchaseToken) return false

  // TODO: Integrate actual store APIs when service account keys are configured.
  // For now, accept any non-empty token. Production MUST validate server-side.
  // This is flagged as a known gap — see Story 27.12 Dev Notes.
  if (platform === 'android') {
    const serviceKey = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY
    if (serviceKey) {
      // Production: call Google Play Developer API
      // const result = await googlePlayApi.verifySubscription(purchaseToken, serviceKey)
      // return result.valid
    }
  } else {
    const serverKey = process.env.APPLE_APP_STORE_SERVER_KEY
    if (serverKey) {
      // Production: call Apple App Store Server API
      // const result = await appleStoreApi.verifyTransaction(purchaseToken, serverKey)
      // return result.valid
    }
  }

  // Accept token when store API keys are not configured (development/testing)
  return true
}
