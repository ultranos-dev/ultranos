import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { enforceConsentMiddleware } from '../middleware/enforceConsent'
import { enforceEntitlement } from '../middleware/enforceEntitlement'
import { enforceVerifiedOrg } from '../middleware/enforceVerifiedOrg'
import { labRestrictedProcedure } from '../rbac'
import { AuditLogger } from '@ultranos/audit-logger'
import { db } from '@/lib/supabase'

/**
 * DiagnosticReport domain router.
 * Story 16.8: DiagnosticReport Read & List Endpoints.
 *
 * Provides read and list operations for diagnostic reports.
 * RBAC: DOCTOR, CLINICIAN, LAB_TECH, ADMIN.
 * report_conclusion is a PHI field — decrypted via db.fromRow().
 */
export const diagnosticReportRouter = createTRPCRouter({
  /**
   * AC 1: Read a single DiagnosticReport with decrypted report_conclusion.
   * Enforces RBAC + consent. Emits PHI_READ audit event.
   * Returns file metadata (no inline content) + download URL.
   */
  read: protectedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceResourceAccess('DiagnosticReport'))
    .input(
      z.object({
        id: z.string().uuid(),
        patientRef: z.string().min(1),
      })
    )
    .use(enforceConsentMiddleware('DiagnosticReport'))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('diagnostic_reports')
        .select(
          'id, status, loinc_code, loinc_display, patient_ref, performer_id, lab_id, issued, collection_date, report_conclusion, virus_scan_status, _ultranos_created_at, updated_at'
        )
        .eq('id', input.id)
        .eq('virus_scan_status', 'clean')
        .single()

      if (error || !data) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Diagnostic report not found',
        })
      }

      // Verify consent was checked for the correct patient (match encounter.read pattern)
      if (data.patient_ref !== input.patientRef) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Diagnostic report not found',
        })
      }

      // Decrypt PHI fields via db.fromRow()
      const report = db.fromRow(data) as Record<string, unknown>

      // Fetch associated file metadata (no encrypted_content)
      const { data: files } = await ctx.supabase
        .from('lab_result_files')
        .select('id, file_name, file_type, file_size, _ultranos_created_at')
        .eq('diagnostic_report_id', input.id)

      // Audit PHI access (CLAUDE.md Rule #6)
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'DIAGNOSTIC_REPORT',
          resourceId: input.id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'read' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'DIAGNOSTIC_REPORT', resourceId: input.id })
      }

      return {
        id: report.id as string,
        resourceType: 'DiagnosticReport' as const,
        status: report.status as string,
        loincCode: report.loincCode as string | null,
        loincDisplay: report.loincDisplay as string | null,
        patientRef: report.patientRef as string,
        performerId: report.performerId as string | null,
        labId: report.labId as string | null,
        issued: report.issued as string | null,
        collectionDate: report.collectionDate as string | null,
        reportConclusion: report.reportConclusion as string | null,
        virusScanStatus: report.virusScanStatus as string,
        createdAt: report.ultranosCreatedAt as string | null,
        updatedAt: report.updatedAt as string | null,
        files: (files ?? []).map((f) => ({
          id: f.id,
          fileName: f.file_name,
          fileType: f.file_type,
          fileSize: f.file_size,
          downloadUrl: `/api/lab-files/${f.id}`,
        })),
      }
    }),

  /**
   * AC 2: List reports by patient, ordered by collection_date DESC.
   * Cursor-based pagination with composite key (collection_date, id).
   * Emits PHI_READ audit event.
   */
  listByPatient: protectedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceResourceAccess('DiagnosticReport'))
    .input(
      z.object({
        patientRef: z.string().min(1),
        cursor: z.string().uuid().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .use(enforceConsentMiddleware('DiagnosticReport'))
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('diagnostic_reports')
        .select(
          'id, status, loinc_code, loinc_display, patient_ref, performer_id, lab_id, issued, collection_date, virus_scan_status, _ultranos_created_at'
        )
        .eq('patient_ref', input.patientRef)
        .eq('virus_scan_status', 'clean')
        .order('collection_date', { ascending: false })
        .order('id', { ascending: false })
        .limit(input.limit + 1)

      // Cursor-based pagination using composite key (collection_date, id)
      if (input.cursor) {
        const { data: cursorReport } = await ctx.supabase
          .from('diagnostic_reports')
          .select('collection_date, id')
          .eq('id', input.cursor)
          .single()

        if (!cursorReport) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid cursor — report not found',
          })
        }

        if (cursorReport.collection_date) {
          query = query.or(
            `collection_date.lt.${cursorReport.collection_date},and(collection_date.eq.${cursorReport.collection_date},id.lt.${cursorReport.id})`
          )
        } else {
          // NULL collection_date: only use id for ordering
          query = query.lt('id', cursorReport.id)
        }
      }

      const { data, error } = await query

      if (error) {
        console.error('DiagnosticReport listByPatient error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve diagnostic reports',
        })
      }

      const rows = data ?? []
      const hasMore = rows.length > input.limit
      const items = hasMore ? rows.slice(0, input.limit) : rows
      const mapped = db.fromRows(items)

      // Audit PHI access (CLAUDE.md Rule #6)
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'DIAGNOSTIC_REPORT',
          resourceId: `patient-reports:${input.patientRef}`,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { patientRef: input.patientRef, resultCount: items.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'DIAGNOSTIC_REPORT' })
      }

      return {
        reports: mapped.map((row: Record<string, unknown>) => ({
          id: row.id as string,
          resourceType: 'DiagnosticReport' as const,
          status: row.status as string,
          loincCode: row.loincCode as string | null,
          loincDisplay: row.loincDisplay as string | null,
          patientRef: row.patientRef as string,
          performerId: row.performerId as string | null,
          labId: row.labId as string | null,
          issued: row.issued as string | null,
          collectionDate: row.collectionDate as string | null,
          virusScanStatus: row.virusScanStatus as string,
          createdAt: row.ultranosCreatedAt as string | null,
        })),
        nextCursor: hasMore ? (items[items.length - 1]!.id as string) : undefined,
      }
    }),

  /**
   * AC 3: List reports by lab, ordered by issued DESC.
   * Uses labRestrictedProcedure — scopes to requesting tech's lab.
   * No consent middleware (lab-scoped operational view).
   * Emits READ audit event (not PHI_READ — operational).
   */
  listByLab: labRestrictedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceResourceAccess('DiagnosticReport'))
    .input(
      z.object({
        cursor: z.string().uuid().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      // Report scope depends on the caller:
      // - LAB_TECH: labRestrictedProcedure injected ctx.lab → their own lab only.
      // - ADMIN: no ctx.lab; scope to EVERY lab in their org (labs.org_id = orgId),
      //   mirroring admin.ts lab-oversight scoping. Lab-Lite is used by org ADMINs
      //   too, so an org admin can review all their org's synced reports.
      const labId = (ctx as any).lab?.labId
      let orgLabIds: string[] | null = null

      if (!labId) {
        if (ctx.user.role === 'ADMIN' && ctx.user.orgId) {
          const { data: orgLabs, error: orgLabsError } = await ctx.supabase
            .from('labs')
            .select('id')
            .eq('org_id', ctx.user.orgId)

          if (orgLabsError) {
            console.error('DiagnosticReport listByLab org-labs error:', { code: orgLabsError.code })
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to resolve organization labs',
            })
          }

          orgLabIds = (orgLabs ?? []).map((l: { id: string }) => l.id)

          // Org has no labs → nothing to list. Return empty rather than issuing an
          // `.in('lab_id', [])` (ambiguous) or a 403 (there's simply no data yet).
          if (orgLabIds.length === 0) {
            return { reports: [], nextCursor: undefined }
          }
        } else {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Lab affiliation required',
          })
        }
      }

      let query = ctx.supabase
        .from('diagnostic_reports')
        .select(
          'id, status, loinc_code, loinc_display, patient_ref, performer_id, lab_id, issued, collection_date, virus_scan_status, _ultranos_created_at'
        )
      query = labId ? query.eq('lab_id', labId) : query.in('lab_id', orgLabIds!)
      query = query
        .order('issued', { ascending: false })
        .order('id', { ascending: false })
        .limit(input.limit + 1)

      // Cursor-based pagination using composite key (issued, id)
      if (input.cursor) {
        const { data: cursorReport } = await ctx.supabase
          .from('diagnostic_reports')
          .select('issued, id')
          .eq('id', input.cursor)
          .single()

        if (!cursorReport) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid cursor — report not found',
          })
        }

        if (cursorReport.issued) {
          query = query.or(
            `issued.lt.${cursorReport.issued},and(issued.eq.${cursorReport.issued},id.lt.${cursorReport.id})`
          )
        } else {
          query = query.lt('id', cursorReport.id)
        }
      }

      const { data, error } = await query

      if (error) {
        console.error('DiagnosticReport listByLab error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve diagnostic reports',
        })
      }

      const rows = data ?? []
      const hasMore = rows.length > input.limit
      const items = hasMore ? rows.slice(0, input.limit) : rows
      const mapped = db.fromRows(items)

      // Audit operational access (not PHI_READ — lab-scoped, no patient data beyond refs)
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'READ',
          resourceType: 'DIAGNOSTIC_REPORT',
          resourceId: labId ? `lab-reports:${labId}` : `org-reports:${ctx.user.orgId}`,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: labId
            ? { labId, resultCount: items.length }
            : { orgId: ctx.user.orgId, labCount: orgLabIds!.length, resultCount: items.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'READ', resourceType: 'DIAGNOSTIC_REPORT' })
      }

      return {
        reports: mapped.map((row: Record<string, unknown>) => ({
          id: row.id as string,
          resourceType: 'DiagnosticReport' as const,
          status: row.status as string,
          loincCode: row.loincCode as string | null,
          loincDisplay: row.loincDisplay as string | null,
          patientRef: row.patientRef as string,
          performerId: row.performerId as string | null,
          labId: row.labId as string | null,
          issued: row.issued as string | null,
          collectionDate: row.collectionDate as string | null,
          virusScanStatus: row.virusScanStatus as string,
          createdAt: row.ultranosCreatedAt as string | null,
        })),
        nextCursor: hasMore ? (items[items.length - 1]!.id as string) : undefined,
      }
    }),
})
