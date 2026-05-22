import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { AuditLogger } from '@ultranos/audit-logger'

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
          'ultranos_is_active, merged_into'
        )
        .eq('id', input.patientId)
        .single()

      if (error || !data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Patient not found' })
      }

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
          metadata: { operation: 'admin_get_by_id' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceId: input.patientId })
      }

      return { patient: data }
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
          'mpi_score, mpi_warn, patient_tier, is_active, created_at, created_by, ultranos_is_active'
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

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PATIENT',
          resourceId: 'admin-search',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'admin_search', resultCount: (data ?? []).length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceId: 'admin-search' })
      }

      return { patients: data ?? [] }
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

      // Update survivor with resolved fields (if any)
      if (Object.keys(survivorUpdates).length > 0) {
        survivorUpdates.updated_at = new Date().toISOString()
        const { error: updateErr } = await ctx.supabase
          .from('patients')
          .update(survivorUpdates)
          .eq('id', input.survivorId)
          .eq('is_active', true)

        if (updateErr) {
          console.error('[PATIENT_ADMIN] Survivor update error:', { code: updateErr.code })
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update survivor' })
        }
      }

      // Mark duplicate as merged (inactive)
      const { error: deactivateErr } = await ctx.supabase
        .from('patients')
        .update({
          merged_into: input.survivorId,
          is_active: false,
          ultranos_is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.duplicateId)

      if (deactivateErr) {
        console.error('[PATIENT_ADMIN] Duplicate deactivation error:', { code: deactivateErr.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to deactivate duplicate' })
      }

      // Create merge_audit record
      const unmergeDeadline = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
      const { data: auditRow, error: auditInsertErr } = await ctx.supabase
        .from('merge_audits')
        .insert({
          survivor_id: input.survivorId,
          duplicate_id: input.duplicateId,
          field_resolutions: input.fieldResolutions,
          original_survivor: originalSurvivor,
          original_duplicate: originalDuplicate,
          merged_by: ctx.user.sub,
          unmerge_deadline: unmergeDeadline,
          status: 'ACTIVE',
        })
        .select('id')
        .single()

      if (auditInsertErr || !auditRow) {
        console.error('[PATIENT_ADMIN] Merge audit insert error:', { code: auditInsertErr?.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create merge audit' })
      }

      // Update duplicate_reviews for the duplicate to MERGED status
      await ctx.supabase
        .from('duplicate_reviews')
        .update({
          status: 'MERGED',
          reviewed_by: ctx.user.sub,
          reviewed_at: new Date().toISOString(),
        })
        .eq('patient_id', input.duplicateId)
        .eq('status', 'PENDING')

      // Clear mpi_warn on survivor if no remaining PENDING reviews
      const { data: pendingReviews } = await ctx.supabase
        .from('duplicate_reviews')
        .select('id')
        .eq('patient_id', input.survivorId)
        .eq('status', 'PENDING')

      if (!pendingReviews || pendingReviews.length === 0) {
        await ctx.supabase
          .from('patients')
          .update({ mpi_warn: false })
          .eq('id', input.survivorId)
      }

      // Audit PHI write
      const audit = new AuditLogger(ctx.supabase)
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

      if (Object.keys(survivorRestores).length > 0) {
        survivorRestores.updated_at = new Date().toISOString()
        const { error: restoreErr } = await ctx.supabase
          .from('patients')
          .update(survivorRestores)
          .eq('id', mergeAudit.survivor_id)

        if (restoreErr) {
          console.error('[PATIENT_ADMIN] Survivor restore error:', { code: restoreErr.code })
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to restore survivor' })
        }
      }

      // Restore duplicate: clear merged_into, re-activate
      const { error: duplicateRestoreErr } = await ctx.supabase
        .from('patients')
        .update({
          merged_into: null,
          is_active: true,
          ultranos_is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', mergeAudit.duplicate_id)

      if (duplicateRestoreErr) {
        console.error('[PATIENT_ADMIN] Duplicate restore error:', { code: duplicateRestoreErr.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to restore duplicate' })
      }

      // Update merge_audit: status REVERSED
      const { error: auditUpdateErr } = await ctx.supabase
        .from('merge_audits')
        .update({
          status: 'REVERSED',
          reversed_by: ctx.user.sub,
          reversed_at: new Date().toISOString(),
        })
        .eq('id', input.mergeAuditId)

      if (auditUpdateErr) {
        console.error('[PATIENT_ADMIN] Merge audit update error:', { code: auditUpdateErr.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update merge audit' })
      }

      // Set mpi_warn = true on both patients (post-unmerge safety flag)
      await ctx.supabase
        .from('patients')
        .update({ mpi_warn: true })
        .eq('id', mergeAudit.survivor_id)

      await ctx.supabase
        .from('patients')
        .update({ mpi_warn: true })
        .eq('id', mergeAudit.duplicate_id)

      // Audit PHI write
      const audit = new AuditLogger(ctx.supabase)
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
