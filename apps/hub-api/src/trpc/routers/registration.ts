import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { baseProcedure, createTRPCRouter, protectedProcedure } from '../init'
import { roleRestrictedProcedure } from '../rbac'
import { AuditLogger } from '@ultranos/audit-logger'

/** Allowed MIME types for KYC document uploads */
const ALLOWED_KYC_CONTENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const

/** KYC document type enum */
const KYC_DOCUMENT_TYPE = z.enum(['MEDICAL_LICENSE', 'NATIONAL_ID'])

/** OCR field result schema */
const ocrFieldSchema = z.object({
  name: z.string(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
})

/** KYC document schema for submission */
const kycDocumentSchema = z.object({
  type: KYC_DOCUMENT_TYPE,
  storageKey: z.string().min(1),
  ocrResults: z.object({
    fields: z.array(ocrFieldSchema),
  }),
})

/**
 * Slugify an organization name for URL-safe usage.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Registration domain router.
 * Story 27.6: Organization & Admin Self-Registration.
 *
 * Contains both public (registerOrganization) and authenticated (selectInitialModules) endpoints.
 * No PHI involved — registration data is operational metadata.
 */
export const registrationRouter = createTRPCRouter({
  /**
   * AC #1, #2, #7: Register a new organization and admin user.
   * Public endpoint — no auth required (uses baseProcedure).
   * Creates org with PENDING_VERIFICATION status and 30-day trial period.
   * Creates Supabase Auth user with ADMIN role linked to the new org.
   * Emits audit event with no PHI.
   */
  registerOrganization: baseProcedure
    .input(
      z.object({
        orgName: z.string().min(2).max(200),
        countryCode: z
          .string()
          .length(2)
          .regex(/^[A-Z]{2}$/, 'Must be ISO 3166-1 alpha-2 (e.g., "IQ", "AF")'),
        billingEmail: z.string().email(),
        adminName: z.string().min(2).max(200),
        adminEmail: z.string().email(),
        adminPassword: z.string().min(12).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Generate slug with uniqueness handling
      const baseSlug = slugify(input.orgName)
      if (!baseSlug) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Organization name must contain at least one alphanumeric character (a-z, 0-9)',
        })
      }
      let slug = baseSlug
      let slugAttempt = 0

      // Try slug, slug-2, slug-3, etc. until unique
      while (true) {
        const { data: existing } = await ctx.supabase
          .from('organizations')
          .select('id')
          .eq('slug', slug)
          .maybeSingle()

        if (!existing) break

        slugAttempt++
        slug = `${baseSlug}-${slugAttempt + 1}`

        if (slugAttempt > 20) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Registration failed — please try again',
          })
        }
      }

      // Calculate trial end date (30 days from now)
      const trialEndsAt = new Date()
      trialEndsAt.setDate(trialEndsAt.getDate() + 30)

      // Create organization with PENDING_VERIFICATION status
      const { data: org, error: orgError } = await ctx.supabase
        .from('organizations')
        .insert({
          name: input.orgName,
          slug,
          billing_email: input.billingEmail,
          billing_contact_name: input.adminName,
          country_code: input.countryCode,
          status: 'PENDING_VERIFICATION',
          trial_ends_at: trialEndsAt.toISOString(),
        })
        .select('id')
        .single()

      if (orgError || !org) {
        console.error('[REGISTRATION_DEBUG] org insert failed:', orgError)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Registration failed — please try again',
        })
      }

      // Create Supabase Auth user — roll back org on failure (transaction safety)
      let createdUserId: string | null = null
      try {
        const { data: authData, error: authError } =
          await ctx.supabase.auth.admin.createUser({
            email: input.adminEmail,
            password: input.adminPassword,
            email_confirm: true,
            user_metadata: {
              name: input.adminName,
              role: 'ADMIN',
              org_id: org.id,
            },
          })

        if (authError) {
          // Anti-enumeration: catch duplicate email and return generic error
          throw authError
        }

        createdUserId = authData.user.id

        // Emit audit event — no PHI (AC #7)
        const audit = new AuditLogger(ctx.supabase)
        try {
          await audit.emit({
            action: 'CREATE',
            resourceType: 'Organization',
            resourceId: org.id,
            actorId: createdUserId,
            actorRole: 'ADMIN',
            outcome: 'SUCCESS',
            sessionId: 'registration',
            metadata: { orgName: input.orgName, countryCode: input.countryCode },
          })
        } catch {
          // Audit failure must not block registration
          console.warn('[AUDIT_FAILURE]', {
            action: 'CREATE',
            resourceType: 'Organization',
            resourceId: org.id,
          })
        }

        return {
          success: true,
          orgId: org.id,
          slug,
          trialEndsAt: trialEndsAt.toISOString(),
        }
      } catch (e) {
        console.error('[REGISTRATION_DEBUG] auth/audit failed:', e)
        // Roll back: delete the org
        const { error: deleteError } = await ctx.supabase
          .from('organizations')
          .delete()
          .eq('id', org.id)

        if (deleteError) {
          console.warn('[REGISTRATION_ROLLBACK_FAILURE]', {
            orgId: org.id,
            deleteError: deleteError.code,
          })
        }

        // Roll back: delete the auth user if it was already created
        if (createdUserId) {
          try {
            await ctx.supabase.auth.admin.deleteUser(createdUserId)
          } catch {
            console.warn('[REGISTRATION_ROLLBACK_AUTH_FAILURE]', {
              orgId: org.id,
              userId: createdUserId,
            })
          }
        }

        // Anti-enumeration: never reveal if email already exists (AC #7 / OWASP)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Registration failed — please try again or contact support',
        })
      }
    }),

  /**
   * AC #3, #4: Select initial modules during onboarding.
   * Requires ADMIN auth — the user just registered and logged in.
   * Creates org_subscriptions with TRIAL status matching org trial period.
   */
  selectInitialModules: roleRestrictedProcedure(['ADMIN'])
    .input(
      z.object({
        orgId: z.string().uuid(),
        moduleCodes: z.array(z.string()).min(1, 'At least one module must be selected'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the admin belongs to this org
      if (ctx.user.orgId !== input.orgId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied — cannot manage subscriptions for another organization',
        })
      }

      // Deduplicate module codes to prevent duplicate subscription rows
      const uniqueModuleCodes = [...new Set(input.moduleCodes)]

      // Verify org status and get trial_ends_at in a single query
      const { data: orgData, error: orgError } = await ctx.supabase
        .from('organizations')
        .select('status, trial_ends_at')
        .eq('id', input.orgId)
        .single()

      if (orgError || !orgData) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve organization data',
        })
      }

      if (orgData.status !== 'PENDING_VERIFICATION') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Module selection is only available during initial onboarding',
        })
      }

      // Check if org already has active subscriptions (prevent duplicate onboarding)
      const { data: existingSubs } = await ctx.supabase
        .from('org_subscriptions')
        .select('id')
        .eq('org_id', input.orgId)
        .in('status', ['ACTIVE', 'TRIAL'])
        .limit(1)

      if (existingSubs && existingSubs.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Organization already has active subscriptions',
        })
      }

      // Validate all requested module codes exist and are active
      const { data: validModules, error: modulesError } = await ctx.supabase
        .from('modules')
        .select('code')
        .eq('is_active', true)
        .in('code', uniqueModuleCodes)

      if (modulesError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to validate modules',
        })
      }

      const validCodes = new Set((validModules ?? []).map((m) => m.code as string))
      const invalidCodes = uniqueModuleCodes.filter((c) => !validCodes.has(c))

      if (invalidCodes.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid module codes: ${invalidCodes.join(', ')}`,
        })
      }

      const now = new Date().toISOString()

      // Create org_subscriptions for each selected module
      const subscriptionRows = uniqueModuleCodes.map((code) => ({
        org_id: input.orgId,
        module_code: code,
        status: 'TRIAL',
        started_at: now,
        expires_at: orgData.trial_ends_at,
      }))

      const { error: insertError } = await ctx.supabase
        .from('org_subscriptions')
        .insert(subscriptionRows)

      if (insertError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create subscriptions',
        })
      }

      // Emit audit event per module added (no PHI)
      const audit = new AuditLogger(ctx.supabase)
      for (const code of uniqueModuleCodes) {
        try {
          await audit.emit({
            action: 'CREATE',
            resourceType: 'SUBSCRIPTION',
            resourceId: `${input.orgId}:${code}`,
            actorId: ctx.user.sub,
            actorRole: ctx.user.role,
            outcome: 'SUCCESS',
            sessionId: ctx.user.sessionId,
            metadata: { orgId: input.orgId, moduleCode: code },
          })
        } catch {
          console.warn('[AUDIT_FAILURE]', {
            action: 'CREATE',
            resourceType: 'SUBSCRIPTION',
          })
        }
      }

      return {
        success: true,
        subscriptions: uniqueModuleCodes.map((code) => ({
          moduleCode: code,
          status: 'TRIAL',
          expiresAt: orgData.trial_ends_at,
        })),
      }
    }),

  /**
   * Story 22.5 AC #10: Generate a signed upload URL for KYC document uploads.
   * Returns a pre-signed URL for Supabase Storage (kyc-documents bucket).
   * Only the practitioner themselves can request an upload URL.
   */
  getKycUploadUrl: protectedProcedure
    .input(
      z.object({
        practitionerId: z.string().uuid(),
        documentType: KYC_DOCUMENT_TYPE,
        contentType: z.enum(ALLOWED_KYC_CONTENT_TYPES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Self-service only: caller must match practitionerId
      if (ctx.user.sub !== input.practitionerId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied — can only upload documents for yourself',
        })
      }

      const storageKey = `${input.practitionerId}/${input.documentType}-${Date.now()}`
      const expiresIn = 900 // 15 minutes

      const { data, error } = await ctx.supabase.storage
        .from('kyc-documents')
        .createSignedUploadUrl(storageKey, { expiresIn })

      if (error || !data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate upload URL',
        })
      }

      return {
        uploadUrl: data.signedUrl,
        storageKey,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      }
    }),

  /**
   * Story 22.5 AC #9, #11: Submit KYC documents and OCR results.
   * Stores the submission in kyc_submissions table, emits audit event.
   * Self-service only: caller must match practitionerId.
   */
  submitKyc: protectedProcedure
    .input(
      z.object({
        practitionerId: z.string().uuid(),
        documents: z.array(kycDocumentSchema).min(1).max(2),
        registryNumber: z.string().min(1).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Self-service only: caller must match practitionerId
      if (ctx.user.sub !== input.practitionerId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied — can only submit KYC for yourself',
        })
      }

      // Verify practitioner exists and is in a submittable state
      const { data: practitioner, error: practError } = await ctx.supabase
        .from('practitioners')
        .select('id, kyc_status')
        .eq('id', input.practitionerId)
        .single()

      if (practError || !practitioner) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Practitioner not found',
        })
      }

      // Only allow submission from REJECTED or REQUEST_MORE_INFO — not PENDING_VERIFICATION
      // (prevents spam-submission while already awaiting review)
      const submittableStatuses = ['REJECTED', 'REQUEST_MORE_INFO']
      if (!submittableStatuses.includes(practitioner.kyc_status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'KYC submission not allowed in current status',
        })
      }

      // Store KYC submission (append-only — previous submissions preserved)
      const { data: submission, error: insertError } = await ctx.supabase
        .from('kyc_submissions')
        .insert({
          practitioner_id: input.practitionerId,
          status: 'PENDING',
          documents: input.documents,
          registry_number: input.registryNumber,
        })
        .select('id, submitted_at')
        .single()

      if (insertError || !submission) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to store KYC submission',
        })
      }

      // Update practitioner kyc_status back to PENDING_VERIFICATION (for re-submissions)
      const { error: updateError } = await ctx.supabase
        .from('practitioners')
        .update({ kyc_status: 'PENDING_VERIFICATION' })
        .eq('id', input.practitionerId)

      if (updateError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update practitioner status',
        })
      }

      // Emit audit event — no PHI (AC #11, opaque IDs only)
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'KYC_SUBMITTED',
          resourceType: 'KYC_SUBMISSION',
          resourceId: submission.id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { practitionerId: input.practitionerId },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', {
          action: 'KYC_SUBMITTED',
          resourceType: 'KYC_SUBMISSION',
          resourceId: submission.id,
        })
      }

      return {
        success: true,
        submissionId: submission.id,
        submittedAt: submission.submitted_at,
        message: 'Pending Verification — we will notify you within 3 business days',
      }
    }),

  /**
   * Story 22.5: Get current KYC status and latest submission for the calling practitioner.
   * Used by the OPD Lite frontend to determine which view to show.
   */
  getKycStatus: protectedProcedure
    .input(
      z.object({
        practitionerId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Self-service only
      if (ctx.user.sub !== input.practitionerId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied — can only view own KYC status',
        })
      }

      const { data: practitioner, error: practError } = await ctx.supabase
        .from('practitioners')
        .select('kyc_status')
        .eq('id', input.practitionerId)
        .single()

      if (practError || !practitioner) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Practitioner not found',
        })
      }

      // Get latest submission (if any) — exclude documents column to avoid leaking storageKeys/PII
      const { data: latestSubmission } = await ctx.supabase
        .from('kyc_submissions')
        .select('id, status, registry_number, rejection_reason, admin_message, submitted_at')
        .eq('practitioner_id', input.practitionerId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      return {
        kycStatus: practitioner.kyc_status as string,
        latestSubmission: latestSubmission ?? null,
      }
    }),
})
