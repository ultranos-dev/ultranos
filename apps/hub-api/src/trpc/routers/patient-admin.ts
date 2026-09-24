import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { AuditLogger } from '@ultranos/audit-logger'
import { signPhotoUrls, signPhotoUrl } from '@/lib/photo-urls'

function sanitizeFilterValue(value: string): string {
  return value
    .replace(/[,.*()\\]/g, '')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

/**
 * Patient Admin router — merge/unmerge operations for duplicate resolution.
 * All endpoints require ADMIN role.
 */
export const patientAdminRouter = createTRPCRouter({
  // ── getById ───────────────────────────────────────────────
  getById: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .input(z.object({ patientId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin role required' })
      }

      const { data, error } = await ctx.supabase
        .from('patients')
        .select(
          'id, name_given, name_father, name_grandfather, gender, birth_year, ' +
          'address_district_origin, address_province_origin, ' +
          'mpi_score, mpi_warn, patient_tier, is_active, created_at, created_by, ' +
          'ultranos_is_active, merged_into, photo_url'
        )
        .eq('id', input.patientId)
        .single()

      if (error || !data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Patient not found' })
      }

      const photoUrl = await signPhotoUrl(ctx.supabase, 'patient-photos', (data as any).photo_url ?? null)

      // FAIL-CLOSED (Story 61.1 decision): on the highest-privilege PHI surface, a PHI
      // read must NOT be served if it cannot be audited (Rule #6 — no exceptions). The
      // emit happens BEFORE the PHI is returned; an emit failure aborts the read so no
      // un-audited PHI ever leaves the Hub. (Contrast the merge/unmerge WRITES below,
      // where the row change has already committed and cannot be un-done, so those emit
      // post-commit and surface the failure without falsely signalling a failed merge.)
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PATIENT',
          resourceId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'admin_get_by_id' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceId: input.patientId })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Audit log unavailable — PHI read blocked',
        })
      }

      // Untyped SupabaseClient widens data to include GenericStringError; narrow
      // to a plain row shape after the error/null check above.
      const patientRow = data as unknown as Record<string, unknown>
      return { patient: { ...patientRow, photoUrl } }
    }),

  // ── adminSearch ────────────────────────────────────────────
  adminSearch: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .input(
      z.object({
        query: z.string().min(1).max(200),
        mpiWarnOnly: z.boolean().optional(),
        hasPendingReview: z.boolean().optional(),
        includeInactive: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin role required' })
      }

      const sanitized = sanitizeFilterValue(input.query)
      if (!sanitized.replace(/\\[%_]/g, '').trim()) {
        return { patients: [] }
      }

      const nameFilter = `ultranos_name_local.ilike.%${sanitized}%,ultranos_name_latin.ilike.%${sanitized}%`

      let query = ctx.supabase
        .from('patients')
        .select(
          'id, name_given, name_father, name_grandfather, gender, birth_year, ' +
          'address_district_origin, address_province_origin, ' +
          'mpi_score, mpi_warn, patient_tier, is_active, created_at, created_by, ultranos_is_active, photo_url'
        )
        .or(nameFilter)
        .order('created_at', { ascending: false })
        .range(input.offset, input.offset + input.limit - 1)

      if (!input.includeInactive) {
        query = query.eq('is_active', true)
      }

      if (input.mpiWarnOnly) {
        query = query.eq('mpi_warn', true)
      }

      const { data, error } = await query

      if (error) {
        console.error('[PATIENT_ADMIN] Search error:', { code: error.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Admin search failed' })
      }

      const patients = data ?? []
      const patientPhotoMap = await signPhotoUrls(
        ctx.supabase,
        'patient-photos',
        patients.map((p: any) => (p.photo_url as string) ?? null),
      )
      const patientsWithPhotos = patients.map((p: any) => ({
        ...p,
        photoUrl: p.photo_url ? patientPhotoMap[p.photo_url] ?? null : null,
      }))

      // FAIL-CLOSED (Story 61.1 decision): audit the PHI read BEFORE returning results;
      // if the audit cannot be written, block the read rather than serve un-audited PHI.
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PATIENT',
          resourceId: 'admin-search',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'admin_search', resultCount: patientsWithPhotos.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceId: 'admin-search' })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Audit log unavailable — PHI search blocked',
        })
      }

      return { patients: patientsWithPhotos }
    }),

  // ── merge ──────────────────────────────────────────────────
  merge: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .input(
      z.object({
        survivorId: z.string().uuid(),
        duplicateId: z.string().uuid(),
        fieldResolutions: z.record(z.string(), z.enum(['survivor', 'duplicate'])),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin role required' })
      }

      if (input.survivorId === input.duplicateId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot merge a patient with itself' })
      }

      // Fetch both patients — must be active
      const { data: survivor, error: survivorErr } = await ctx.supabase
        .from('patients')
        .select('*')
        .eq('id', input.survivorId)
        .eq('is_active', true)
        .single()

      if (survivorErr || !survivor) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Survivor patient not found or inactive' })
      }

      const { data: duplicate, error: duplicateErr } = await ctx.supabase
        .from('patients')
        .select('*')
        .eq('id', input.duplicateId)
        .eq('is_active', true)
        .single()

      if (duplicateErr || !duplicate) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Duplicate patient not found or inactive' })
      }

      // Store originals before modification
      const originalSurvivor = { ...survivor }
      const originalDuplicate = { ...duplicate }

      // Apply field resolutions: for fields where source = 'duplicate', copy from duplicate to survivor
      const survivorUpdates: Record<string, unknown> = {}
      for (const [field, source] of Object.entries(input.fieldResolutions)) {
        if (source === 'duplicate' && field in duplicate) {
          survivorUpdates[field] = (duplicate as Record<string, unknown>)[field]
        }
      }

      // Story 61.3 (H-ADM-2): the entire merge — survivor update, duplicate
      // deactivation, merge_audits insert, duplicate_reviews→MERGED, and the
      // survivor mpi_warn clear — is now ONE Postgres transaction. Previously
      // these were separate calls; a crash before the merge_audits insert left a
      // merge with no reversal record, voiding the 72h-undo promise. The RPC
      // adds updated_at itself, so we do not stamp it here.
      const { data: rpcData, error: rpcError } = await ctx.supabase.rpc('merge_patient_atomic', {
        p_survivor_id: input.survivorId,
        p_duplicate_id: input.duplicateId,
        p_survivor_updates: survivorUpdates,
        p_field_resolutions: input.fieldResolutions,
        p_original_survivor: originalSurvivor,
        p_original_duplicate: originalDuplicate,
        p_merged_by: ctx.user.sub,
      })

      if (rpcError) {
        // Map the RPC's re-validation failures back to the same 404s callers saw
        // when the pre-fetch guards failed (a patient was deactivated concurrently).
        if (rpcError.message?.includes('SURVIVOR_NOT_ACTIVE')) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Survivor patient not found or inactive' })
        }
        if (rpcError.message?.includes('DUPLICATE_NOT_ACTIVE')) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Duplicate patient not found or inactive' })
        }
        console.error('[PATIENT_ADMIN] Merge RPC error:', { code: rpcError.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to merge patients' })
      }

      const mergeAuditId = (rpcData as Record<string, string> | null)?.['mergeAuditId']
      if (!mergeAuditId) {
        console.error('[PATIENT_ADMIN] Merge RPC returned no mergeAuditId')
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create merge audit' })
      }
      const auditRow = { id: mergeAuditId }

      // Audit PHI write.
      // Story 61.1 decision — WRITE exception to the fail-closed rule: the merge rows have
      // already committed above and cannot be un-done here, so throwing on an audit-emit
      // failure would falsely signal a failed merge to the admin. We therefore emit
      // post-commit and log the failure loudly ([AUDIT_FAILURE]) rather than fail-closed.
      // (Reads — getById/adminSearch — DO fail-closed, since PHI has not yet left the Hub.)
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PATIENT',
          resourceId: input.survivorId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            operation: 'patient_merge',
            survivorId: input.survivorId,
            duplicateId: input.duplicateId,
            mergeAuditId: auditRow.id,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceId: input.survivorId })
      }

      return { success: true, mergeAuditId: auditRow.id as string }
    }),

  // ── unmerge ────────────────────────────────────────────────
  unmerge: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .input(
      z.object({
        mergeAuditId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin role required' })
      }

      // Fetch merge_audit — must be ACTIVE
      const { data: mergeAudit, error: fetchErr } = await ctx.supabase
        .from('merge_audits')
        .select('*')
        .eq('id', input.mergeAuditId)
        .eq('status', 'ACTIVE')
        .single()

      if (fetchErr || !mergeAudit) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merge audit not found or already reversed' })
      }

      // Check unmerge deadline
      if (new Date(mergeAudit.unmerge_deadline) < new Date()) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Unmerge window (72 hours) has expired',
        })
      }

      const fieldResolutions = mergeAudit.field_resolutions as Record<string, string>
      const originalSurvivor = mergeAudit.original_survivor as Record<string, unknown>

      // Restore survivor fields that were sourced from duplicate
      const survivorRestores: Record<string, unknown> = {}
      for (const [field, source] of Object.entries(fieldResolutions)) {
        if (source === 'duplicate' && field in originalSurvivor) {
          survivorRestores[field] = originalSurvivor[field]
        }
      }

      // Story 61.3 (H-ADM-2): the whole reversal — survivor restore, duplicate
      // re-activation, merge_audits→REVERSED, and both mpi_warn flags — is ONE
      // transaction. The RPC re-locks + re-validates the merge_audit is ACTIVE
      // and inside its 72h window (defence in depth over the pre-fetch above) and
      // stamps updated_at itself, so we do not stamp it here.
      const { error: rpcError } = await ctx.supabase.rpc('unmerge_patient_atomic', {
        p_merge_audit_id: input.mergeAuditId,
        p_survivor_restores: survivorRestores,
        p_reversed_by: ctx.user.sub,
      })

      if (rpcError) {
        if (rpcError.message?.includes('MERGE_AUDIT_NOT_ACTIVE')) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merge audit not found or already reversed' })
        }
        if (rpcError.message?.includes('UNMERGE_WINDOW_EXPIRED')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Unmerge window (72 hours) has expired' })
        }
        console.error('[PATIENT_ADMIN] Unmerge RPC error:', { code: rpcError.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to unmerge patients' })
      }

      // Audit PHI write (unmerge). Same Story 61.1 WRITE exception as merge above: the
      // reversal has already committed, so emit post-commit and log loudly on failure
      // rather than fail-closed (which would falsely signal a failed unmerge).
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PATIENT',
          resourceId: mergeAudit.survivor_id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            operation: 'patient_unmerge',
            survivorId: mergeAudit.survivor_id,
            duplicateId: mergeAudit.duplicate_id,
            mergeAuditId: input.mergeAuditId,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceId: mergeAudit.survivor_id })
      }

      return { success: true }
    }),
})
