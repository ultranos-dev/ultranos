import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { roleRestrictedProcedure } from '../rbac'
import { enforceConsentMiddleware } from '../middleware/enforceConsent'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { enforceEntitlement } from '../middleware/enforceEntitlement'
import { enforceVerifiedOrg } from '../middleware/enforceVerifiedOrg'
import { AuditLogger } from '@ultranos/audit-logger'
import { checkInteractions } from '@ultranos/drug-db'
import { db } from '@/lib/supabase'
import {
  drugInteractionChecksTotal,
  drugInteractionOverridesTotal,
  prescriptionsWithoutInteractionCheckTotal,
} from '@/lib/clinical-safety-metrics'
import { createSupabaseDrugAdapter } from '@/lib/supabase-drug-adapter'
import { verifyEd25519Signature } from '@/lib/ed25519-verify'
import { isKeyRevoked } from '@/lib/krl-check'
import { buildTTSPrompt, getDisclaimer } from '@/lib/tts-prompt-builder'
import type { TTSDialect } from '@/lib/tts-prompt-builder'
import { synthesizeSpeech, isTTSError } from '@/lib/tts-client'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Story 10.1: Create or update a MedicationStatement when a prescription is dispensed.
 * Best-effort — does not fail the parent operation on error.
 */
async function createMedicationStatementOnDispense(
  supabase: SupabaseClient,
  prescriptionId: string,
  patientRef: string,
  actorId: string,
  hlcTimestamp: string,
): Promise<void> {
  try {
    // Fetch medication details from the prescription
    const { data: rx } = await supabase
      .from('medication_requests')
      .select('id, medication_codeable_concept, medication_display, subject_reference, encounter_reference')
      .eq('id', prescriptionId)
      .single()

    if (!rx) return

    const now = new Date().toISOString()

    // Check if a MedicationStatement already exists for this prescription
    const { data: existing } = await supabase
      .from('medication_statements')
      .select('id')
      .eq('source_prescription_id', prescriptionId)
      .eq('status', 'active')
      .limit(1)

    if (existing && existing.length > 0) {
      // Update effective period
      await supabase
        .from('medication_statements')
        .update(db.toRow({
          effectivePeriodStart: now,
          metaLastUpdated: now,
          hlcTimestamp,
        }))
        .eq('id', existing[0].id)
      return
    }

    // Create new MedicationStatement
    const row = db.toRow({
      id: crypto.randomUUID(),
      resourceType: 'MedicationStatement',
      status: 'active',
      medicationCodeableConcept: rx.medication_codeable_concept,
      medicationDisplay: rx.medication_display,
      subjectReference: rx.subject_reference ?? patientRef,
      effectivePeriodStart: now,
      dateAsserted: now,
      informationSourceReference: `Practitioner/${actorId}`,
      sourceEncounterId: rx.encounter_reference?.replace('Encounter/', '') ?? null,
      sourcePrescriptionId: prescriptionId,
      isOfflineCreated: false,
      hlcTimestamp,
      createdAt: now,
      metaLastUpdated: now,
      metaVersionId: '1',
    })

    await supabase.from('medication_statements').insert(row)
  } catch {
    // Best-effort: log but don't fail the parent operation
    console.warn('[MedicationStatement] Failed to create on dispense', { prescriptionId })
  }
}

/**
 * Story 10.1: Stop a MedicationStatement when a prescription is voided.
 * Best-effort — does not fail the parent operation on error.
 */
async function stopMedicationStatementOnVoid(
  supabase: SupabaseClient,
  prescriptionId: string,
  hlcTimestamp: string,
): Promise<void> {
  try {
    const now = new Date().toISOString()
    await supabase
      .from('medication_statements')
      .update(db.toRow({
        status: 'stopped',
        effectivePeriodEnd: now,
        metaLastUpdated: now,
        hlcTimestamp,
      }))
      .eq('source_prescription_id', prescriptionId)
      .eq('status', 'active')
  } catch {
    console.warn('[MedicationStatement] Failed to stop on void', { prescriptionId })
  }
}

/**
 * Maps internal prescription_status to the pharmacist-facing invalidation status.
 * AC 2: Hub returns AVAILABLE, FULFILLED, or VOIDED.
 */
function toInvalidationStatus(prescriptionStatus: string): 'AVAILABLE' | 'FULFILLED' | 'VOIDED' {
  switch (prescriptionStatus) {
    case 'ACTIVE':
      return 'AVAILABLE'
    case 'DISPENSED':
    case 'PARTIALLY_DISPENSED':
      return 'FULFILLED'
    case 'CANCELLED':
    case 'EXPIRED':
      return 'VOIDED'
    default:
      return 'VOIDED'
  }
}

/**
 * Story 23.2: Detect override severity from the interaction check result.
 * Maps the interactionCheck enum to clinical severity levels for metrics.
 */
function detectOverrideSeverity(
  interactionCheck: string,
  overrideReason: string,
): string {
  // The interactionCheck tells us the severity level that was overridden
  if (interactionCheck === 'BLOCKED') return 'CONTRAINDICATED'
  if (interactionCheck === 'WARNING') {
    // Differentiate WARNING sub-types via override reason prefix
    const upper = overrideReason.toUpperCase()
    if (upper.startsWith('ALLERGY')) return 'ALLERGY_MATCH'
    if (upper.startsWith('MAJOR')) return 'MAJOR'
    return 'MODERATE'
  }
  // UNAVAILABLE overrides are tracked separately, but label them for completeness
  return 'MODERATE'
}

/**
 * Story 24.2: Check if a patient has AI_PROCESSING consent.
 * Queries the append-only consent ledger for the latest AI_PROCESSING record.
 * Privacy by Design: missing or expired consent = denied.
 */
async function checkAIProcessingConsent(
  supabase: SupabaseClient,
  patientId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('consents')
    .select('id, status, purpose, date_time, provision_end')
    .eq('patient_ref', `Patient/${patientId}`)
    .eq('purpose', 'AI_PROCESSING')
    .order('date_time', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) {
    return false
  }

  const latest = data[0]
  if (latest.status !== 'ACTIVE') {
    return false
  }

  // Reject expired consent
  if (latest.provision_end && new Date(latest.provision_end) < new Date()) {
    return false
  }

  return true
}

const GetStatusInputSchema = z.object({
  prescriptionId: z.string().uuid().optional(),
  qrCodeId: z.string().min(1).optional(),
  // P3: signedBundle is schematically optional to preserve specific error messages
  // and audit events for unsigned lookup attempts (AC 4). Always required at runtime.
  signedBundle: z.object({
    payload: z.string().min(1),
    sig: z.string().min(1),
    pub: z.string().min(1),
  }).optional(),
})

/** P1: Validates the JSON-parsed contents of a signed prescription payload. */
const SignedPayloadSchema = z.object({
  prescriptionId: z.string().uuid().optional(),
  qrCodeId: z.string().min(1).optional(),
}).refine(data => data.prescriptionId || data.qrCodeId, {
  message: 'Signed payload must contain prescriptionId or qrCodeId',
})

/**
 * Medication domain router.
 * Story 3.4: Global Prescription Invalidation Check.
 * Provides status check and fulfillment completion for pharmacist workflow.
 */
export const medicationRouter = createTRPCRouter({
  /**
   * Story 16.3: Create a MedicationRequest (prescription) on the Hub.
   * RBAC: DOCTOR, CLINICIAN only. PHI fields encrypted via db.toRow().
   */
  create: roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('OPD_LITE'))
    .use(enforceResourceAccess('MedicationRequest'))
    .input(
      z.object({
        prescriptionId: z.string().uuid().optional(),
        medicationCode: z.string().min(1),
        medicationDisplay: z.string().min(1),
        medicationText: z.string().optional(),
        patientId: z.string().uuid(),
        encounterId: z.string().uuid().optional(),
        dosageInstruction: z.record(z.unknown()).optional(),
        dispenseRequest: z.record(z.unknown()).optional(),
        interactionCheck: z.enum(['CLEAR', 'WARNING', 'BLOCKED', 'UNAVAILABLE']),
        interactionOverride: z.string().optional(),
        intent: z.enum(['proposal', 'plan', 'order']).default('order'),
        isOfflineCreated: z.boolean().default(false),
        hlcTimestamp: z.string().min(1),
      }).refine(
        (val) => val.interactionCheck === 'CLEAR' || (val.interactionOverride && val.interactionOverride.length > 0),
        { message: 'interactionOverride is required when interactionCheck is not CLEAR', path: ['interactionOverride'] },
      ),
    )
    .use(enforceConsentMiddleware('MedicationRequest'))
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()
      const prescriptionId = input.prescriptionId ?? crypto.randomUUID()
      const qrCodeId = crypto.randomUUID()

      const row = db.toRow({
        id: prescriptionId,
        resourceType: 'MedicationRequest',
        status: 'active',
        prescriptionStatus: 'ACTIVE',
        intent: input.intent,
        medicationCodeableConcept: input.medicationCode,
        medicationDisplay: input.medicationDisplay,
        medicationText: input.medicationText ?? null,
        subjectReference: `Patient/${input.patientId}`,
        encounterReference: input.encounterId ? `Encounter/${input.encounterId}` : null,
        requesterId: ctx.user.sub,
        dosageInstruction: input.dosageInstruction ?? null,
        dispenseRequest: input.dispenseRequest ?? null,
        interactionCheck: input.interactionCheck,
        interactionOverride: input.interactionOverride ?? null,
        qrCodeId,
        authoredOn: now,
        isOfflineCreated: input.isOfflineCreated,
        hlcTimestamp: input.hlcTimestamp,
        createdAt: now,
        metaLastUpdated: now,
        metaVersionId: '1',
      })

      const { data, error } = await ctx.supabase
        .from('medication_requests')
        .insert(row)
        .select('id')
        .single()

      if (error) {
        // Duplicate key = already synced — verify ownership before returning idempotent success
        if (error.code === '23505') {
          const { data: existing } = await ctx.supabase
            .from('medication_requests')
            .select('requester_id, qr_code_id')
            .eq('id', prescriptionId)
            .single()

          if (existing?.requester_id !== ctx.user.sub) {
            // Audit the rejected conflict attempt (CLAUDE.md Rule #6)
            const conflictAudit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
            try {
              await conflictAudit.emit({
                action: 'PHI_WRITE',
                resourceType: 'PRESCRIPTION',
                resourceId: prescriptionId,
                patientId: input.patientId,
                actorId: ctx.user.sub,
                actorRole: ctx.user.role,
                outcome: 'DENIED',
                sessionId: ctx.user.sessionId,
                metadata: { operation: 'prescription_create_conflict' },
              })
            } catch {
              console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PRESCRIPTION', resourceId: prescriptionId })
            }
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Prescription ID conflict: record belongs to a different clinician',
            })
          }

          // Audit the idempotent replay (CLAUDE.md Rule #6)
          const replayAudit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
          try {
            await replayAudit.emit({
              action: 'PHI_WRITE',
              resourceType: 'PRESCRIPTION',
              resourceId: prescriptionId,
              patientId: input.patientId,
              actorId: ctx.user.sub,
              actorRole: ctx.user.role,
              outcome: 'SUCCESS',
              sessionId: ctx.user.sessionId,
              metadata: { operation: 'prescription_create_idempotent' },
            })
          } catch {
            console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PRESCRIPTION', resourceId: prescriptionId })
          }

          return { prescriptionId, qrCodeId: existing?.qr_code_id ?? qrCodeId, status: 'active' as const, alreadySynced: true }
        }
        console.error('Medication create error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create prescription',
        })
      }

      if (!data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create prescription',
        })
      }

      // Story 23.2: Increment Prometheus clinical safety metrics
      drugInteractionChecksTotal.inc({ result: input.interactionCheck })
      if (input.interactionCheck === 'UNAVAILABLE') {
        prescriptionsWithoutInteractionCheckTotal.inc()
      }
      if (input.interactionOverride) {
        // Parse override severity from the override reason string prefix (e.g., "CONTRAINDICATED: ...")
        // The severity is stored as the interactionCheck value when an override is provided
        const overrideSeverity = detectOverrideSeverity(input.interactionCheck, input.interactionOverride)
        drugInteractionOverridesTotal.inc({ severity: overrideSeverity })
      }

      // Audit PHI write (CLAUDE.md Rule #6)
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PRESCRIPTION',
          resourceId: prescriptionId,
          patientId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'prescription_create', interactionCheck: input.interactionCheck },
        })
      } catch (auditError) {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PRESCRIPTION', resourceId: prescriptionId })
      }

      return {
        prescriptionId,
        qrCodeId,
        status: 'active' as const,
      }
    }),

  /**
   * Story 16.3: Read a single MedicationRequest with decrypted PHI fields.
   * RBAC: DOCTOR, CLINICIAN only.
   */
  read: roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('OPD_LITE'))
    .use(enforceResourceAccess('MedicationRequest'))
    .input(
      z.object({
        prescriptionId: z.string().uuid(),
        patientId: z.string().uuid(),
      }),
    )
    .use(enforceConsentMiddleware('MedicationRequest'))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('medication_requests')
        .select('id, status, prescription_status, intent, medication_codeable_concept, medication_display, medication_text, subject_reference, encounter_reference, requester_id, dosage_instruction, dispense_request, interaction_check, interaction_override, qr_code_id, authored_on, is_offline_created, hlc_timestamp, meta_last_updated, meta_version_id')
        .eq('id', input.prescriptionId)
        .eq('subject_reference', `Patient/${input.patientId}`)
        .single()

      if (error || !data) {
        if (error?.code === 'PGRST116') {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Prescription not found',
          })
        }
        console.error('Medication read error:', { code: error?.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve prescription',
        })
      }

      const decrypted = db.fromRow(data)

      // Audit PHI read (CLAUDE.md Rule #6)
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PRESCRIPTION',
          resourceId: input.prescriptionId,
          patientId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'prescription_read' },
        })
      } catch (auditError) {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'PRESCRIPTION', resourceId: input.prescriptionId })
      }

      return decrypted
    }),

  /**
   * AC 1, 2: Real-time status check against the Hub.
   * Returns AVAILABLE, FULFILLED, or VOIDED.
   */
  getStatus: roleRestrictedProcedure(['PHARMACIST', 'CLINICIAN', 'DOCTOR'])
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('PHARMACY_LITE'))
    .use(enforceResourceAccess('MedicationRequest'))
    .input(GetStatusInputSchema)
    .query(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)

      // Story 21.2: Signature verification enforcement BEFORE any DB lookup.
      if (!input.signedBundle) {
        if (input.prescriptionId || input.qrCodeId) {
          // AC 4: Reject unsigned lookups with raw IDs
          try {
            await audit.emit({
              action: 'SECURITY_VIOLATION',
              resourceType: 'PRESCRIPTION',
              actorId: ctx.user.sub,
              actorRole: ctx.user.role,
              outcome: 'FAILURE',
              sessionId: ctx.user.sessionId,
              metadata: { reason: 'unsigned_lookup', attemptedPrescriptionId: input.prescriptionId, attemptedQrCodeId: input.qrCodeId },
            })
          } catch {
            console.warn('[AUDIT_FAILURE]', { action: 'SECURITY_VIOLATION', reason: 'unsigned_lookup' })
          }
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'UNSIGNED_LOOKUP_REJECTED',
          })
        }
        // P2: Emit audit for completely empty requests (AC 5 — all rejection paths must audit)
        try {
          await audit.emit({
            action: 'SECURITY_VIOLATION',
            resourceType: 'PRESCRIPTION',
            actorId: ctx.user.sub,
            actorRole: ctx.user.role,
            outcome: 'FAILURE',
            sessionId: ctx.user.sessionId,
            metadata: { reason: 'missing_signed_bundle' },
          })
        } catch {
          console.warn('[AUDIT_FAILURE]', { action: 'SECURITY_VIOLATION', reason: 'missing_signed_bundle' })
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'signedBundle is required',
        })
      }

      // AC 1: Verify Ed25519 signature
      const sigValid = verifyEd25519Signature(
        input.signedBundle.payload,
        input.signedBundle.sig,
        input.signedBundle.pub,
      )
      if (!sigValid) {
        // AC 2: Invalid signature → reject, no DB lookup
        try {
          await audit.emit({
            action: 'SECURITY_VIOLATION',
            resourceType: 'PRESCRIPTION',
            actorId: ctx.user.sub,
            actorRole: ctx.user.role,
            outcome: 'FAILURE',
            sessionId: ctx.user.sessionId,
            metadata: { reason: 'invalid_signature' },
          })
        } catch {
          console.warn('[AUDIT_FAILURE]', { action: 'SECURITY_VIOLATION', reason: 'invalid_signature' })
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'INVALID_SIGNATURE',
        })
      }

      // AC 3: Check KRL — reject if key is revoked
      const revoked = await isKeyRevoked(input.signedBundle.pub, ctx.supabase)
      if (revoked) {
        try {
          await audit.emit({
            action: 'SECURITY_VIOLATION',
            resourceType: 'PRESCRIPTION',
            actorId: ctx.user.sub,
            actorRole: ctx.user.role,
            outcome: 'FAILURE',
            sessionId: ctx.user.sessionId,
            metadata: { reason: 'key_revoked', publicKeyPrefix: input.signedBundle.pub.slice(0, 8) },
          })
        } catch {
          console.warn('[AUDIT_FAILURE]', { action: 'SECURITY_VIOLATION', reason: 'key_revoked' })
        }
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'KEY_REVOKED',
        })
      }

      // P1: Extract and validate prescription IDs from verified payload with Zod
      let rawPayload: unknown
      try {
        rawPayload = JSON.parse(input.signedBundle.payload)
      } catch {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid signed payload format',
        })
      }

      const payloadResult = SignedPayloadSchema.safeParse(rawPayload)
      if (!payloadResult.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Signed payload must contain prescriptionId (UUID) or qrCodeId',
        })
      }
      const parsedPayload = payloadResult.data

      const lookupColumn = parsedPayload.prescriptionId ? 'id' : 'qr_code_id'
      const lookupValue = (parsedPayload.prescriptionId ?? parsedPayload.qrCodeId)!

      const { data, error } = await ctx.supabase
        .from('medication_requests')
        .select(
          'id, prescription_status, status, medication_display, authored_on, dispensed_at'
        )
        .eq(lookupColumn, lookupValue)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Prescription not found',
          })
        }
        console.error('Medication status check error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Prescription status check failed',
        })
      }

      // Audit PHI access — prescription data returned (CLAUDE.md Rule #6)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PRESCRIPTION',
          resourceId: data.id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { status: toInvalidationStatus(data.prescription_status) },
        })
      } catch (auditError) {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'PRESCRIPTION', resourceId: data.id })
      }

      return {
        prescriptionId: data.id,
        status: toInvalidationStatus(data.prescription_status),
        medicationDisplay: data.medication_display,
        authoredOn: data.authored_on,
        dispensedAt: data.dispensed_at,
      }
    }),

  /**
   * Story 4.3 AC 1, 2: Record a dispense event from the PWA.
   * Creates a medication_dispense record and updates the parent medication_request status.
   * Emits a medication_request_sync audit log on the Hub.
   *
   * Conflict resolution note: Dispensing uses HLC-based conflict detection (newer wins)
   * rather than Tier 1 append-only merge. This is intentional — pharmacy dispensing is a
   * "Sync-Preferred" event where the correct answer (already dispensed) is deterministic.
   * Appending both and blocking would freeze prescriptions unnecessarily. The TOCTOU guard
   * on the update prevents simultaneous double-dispense.
   */
  recordDispense: protectedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('PHARMACY_LITE'))
    .use(enforceResourceAccess('MedicationDispense'))
    .input(
      z.object({
        dispenseId: z.string().uuid(),
        prescriptionId: z.string().uuid(),
        medicationCode: z.string().min(1),
        medicationDisplay: z.string().min(1),
        patientRef: z.string().min(1),
        pharmacistRef: z.string().startsWith('Practitioner/').min(1),
        whenHandedOver: z.string().datetime(),
        hlcTimestamp: z.string().min(1),
        status: z.enum(['completed', 'in-progress']),
      })
    )
    .use(enforceConsentMiddleware('MedicationRequest'))
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()

      // 1. Lookup prescription FIRST — reject early if not found (fixes W9)
      const { data: currentRx, error: fetchError } = await ctx.supabase
        .from('medication_requests')
        .select('id, prescription_status, status, hlc_timestamp')
        .eq('id', input.prescriptionId)
        .single()

      if (fetchError || !currentRx) {
        if (fetchError?.code === 'PGRST116') {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Prescription not found',
          })
        }
        console.error('Prescription fetch error:', { code: fetchError?.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve prescription for dispense',
        })
      }

      // 2. Validate prescription status — reject CANCELLED/EXPIRED/LEGACY_PAPER
      if (currentRx.prescription_status === 'CANCELLED' || currentRx.prescription_status === 'EXPIRED') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Prescription is no longer active',
        })
      }

      // Story 24.3: Paper prescriptions cannot go through digital dispensing workflow
      if (currentRx.prescription_status === 'LEGACY_PAPER') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Paper prescriptions cannot be processed through digital dispense workflow',
        })
      }

      // 3. Idempotency check — reject if already dispensed (fixes W1)
      const { data: existingDispense } = await ctx.supabase
        .from('medication_dispenses')
        .select('id')
        .eq('prescription_id', input.prescriptionId)
        .eq('status', 'completed')
        .limit(1)

      if (existingDispense && existingDispense.length > 0) {
        // Audit the duplicate attempt before rejecting
        const dupAudit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
        try {
          await dupAudit.emit({
            action: 'DUPLICATE_DISPENSE_ATTEMPT',
            resourceType: 'PRESCRIPTION',
            resourceId: input.prescriptionId,
            actorId: ctx.user.sub,
            actorRole: ctx.user.role,
            outcome: 'DENIED',
            sessionId: ctx.user.sessionId,
            metadata: {
              existingDispenseId: existingDispense[0].id,
              attemptedDispenseId: input.dispenseId,
            },
          })
        } catch {
          // Audit failure must not prevent rejection
          console.warn('[AUDIT_FAILURE]', { action: 'DUPLICATE_DISPENSE_ATTEMPT', resourceId: input.prescriptionId })
        }

        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Prescription has already been dispensed',
          cause: { code: 'ALREADY_DISPENSED', existingDispenseId: existingDispense[0].id },
        })
      }

      // Story 21.3: Override pharmacistRef with server-verified identity.
      // Client-supplied pharmacistRef is untrusted — always use ctx.user.sub.
      const verifiedPharmacistRef = `Practitioner/${ctx.user.sub}`
      if (input.pharmacistRef !== verifiedPharmacistRef) {
        // Audit the mismatch (potential spoofing attempt or stale client data)
        const mismatchAudit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
        try {
          await mismatchAudit.emit({
            action: 'SECURITY_VIOLATION',
            resourceType: 'MEDICATION_DISPENSE',
            resourceId: input.dispenseId,
            actorId: ctx.user.sub,
            actorRole: ctx.user.role,
            outcome: 'SUCCESS',
            sessionId: ctx.user.sessionId,
            metadata: { reason: 'pharmacist_ref_overridden', clientSupplied: input.pharmacistRef.slice(0, 8) + '...' },
          })
        } catch {
          // Audit failure must not block the dispense
        }
      }

      // 4. Insert the medication_dispense record (now safe — prescription validated)
      const { data: dispenseRow, error: insertError } = await ctx.supabase
        .from('medication_dispenses')
        .insert({
          id: input.dispenseId,
          prescription_id: input.prescriptionId,
          medication_code: input.medicationCode,
          medication_display: input.medicationDisplay,
          patient_ref: input.patientRef,
          pharmacist_ref: verifiedPharmacistRef,
          when_handed_over: input.whenHandedOver,
          hlc_timestamp: input.hlcTimestamp,
          status: input.status,
          synced_by: ctx.user.sub,
          synced_at: now,
        })
        .select('id')
        .single()

      if (insertError || !dispenseRow) {
        // Duplicate dispenseId = idempotent replay (offline-first sync delivers same event twice)
        if (insertError?.code === '23505') {
          return {
            success: true,
            dispenseId: input.dispenseId,
            prescriptionStatus: input.status === 'completed' ? 'completed' : 'partial',
            dispensedAt: null,
            conflictDetected: false,
            alreadySynced: true,
          }
        }
        console.error('Dispense insert error:', { code: insertError?.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to record dispense event',
        })
      }

      // AC 5: If prescription already completed with newer HLC, ignore update but log conflict
      const alreadyCompleted = currentRx.prescription_status === 'DISPENSED'
      const existingHlc = currentRx.hlc_timestamp as string | null
      const incomingIsOlder = existingHlc != null && input.hlcTimestamp < existingHlc

      if (alreadyCompleted && incomingIsOlder) {
        const { error: conflictLogError } = await ctx.supabase
          .from('dispense_conflicts')
          .insert({
            id: crypto.randomUUID(),
            dispense_id: input.dispenseId,
            prescription_id: input.prescriptionId,
            incoming_hlc: input.hlcTimestamp,
            existing_hlc: existingHlc,
            resolved_action: 'ignored_older_hlc',
            logged_by: ctx.user.sub,
            logged_at: now,
          })
          .select('id')
          .single()

        if (conflictLogError) {
          console.error('Conflict log insert error:', { code: conflictLogError.code })
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to record dispense conflict',
          })
        }

        return {
          success: true,
          dispenseId: dispenseRow.id,
          prescriptionStatus: 'already_completed',
          dispensedAt: null,
          conflictDetected: true,
        }
      }

      // 3. Update the parent medication_request status
      // Conditional guard on prescription_status prevents TOCTOU double-dispense race
      const newPrescriptionStatus = input.status === 'completed' ? 'DISPENSED' : 'PARTIALLY_DISPENSED'
      const newStatus = input.status === 'completed' ? 'completed' : 'active'

      const { data: updatedRx, error: updateError } = await ctx.supabase
        .from('medication_requests')
        .update({
          prescription_status: newPrescriptionStatus,
          status: newStatus,
          dispensed_at: input.status === 'completed' ? now : null,
          dispensed_by: input.status === 'completed' ? ctx.user.sub : null,
          hlc_timestamp: input.hlcTimestamp,
          meta_last_updated: now,
        })
        .eq('id', input.prescriptionId)
        .eq('prescription_status', currentRx.prescription_status)
        .select('id, prescription_status, status, dispensed_at')
        .single()

      if (updateError || !updatedRx) {
        // Clean up orphaned dispense row — insert succeeded but update failed
        try {
          await ctx.supabase
            .from('medication_dispenses')
            .delete()
            .eq('id', input.dispenseId)
        } catch {
          console.warn('[ORPHAN_CLEANUP_FAILED]', { dispenseId: input.dispenseId })
        }

        if (updateError?.code === 'PGRST116') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Prescription status changed — another pharmacist may have fulfilled it. Please re-scan.',
          })
        }
        console.error('Medication request update error:', { code: updateError?.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update prescription status',
        })
      }

      // Story 10.1: Create MedicationStatement when prescription is fully dispensed
      if (input.status === 'completed') {
        await createMedicationStatementOnDispense(
          ctx.supabase,
          input.prescriptionId,
          input.patientRef,
          ctx.user.sub,
          input.hlcTimestamp,
        )
      }

      // 4. Emit audit log via AuditLogger (replaces direct medication_request_sync insert)
      const dispenseAudit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await dispenseAudit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PRESCRIPTION',
          resourceId: input.prescriptionId,
          patientId: input.patientRef.replace('Patient/', ''),
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            dispenseAction: 'dispense_sync',
            dispenseId: input.dispenseId,
            hlcTimestamp: input.hlcTimestamp,
            newStatus: newPrescriptionStatus,
          },
        })
      } catch (auditError) {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PRESCRIPTION', resourceId: input.prescriptionId })
      }

      return {
        success: true,
        dispenseId: dispenseRow.id,
        prescriptionStatus: input.status === 'completed' ? 'completed' : 'partial',
        dispensedAt: updatedRx.dispensed_at ?? null,
        conflictDetected: false,
      }
    }),

  /**
   * AC 5: Mark prescription as completed/fulfilled upon pharmacist confirmation.
   * Protected — requires authenticated pharmacist session.
   */
  complete: protectedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('PHARMACY_LITE'))
    .use(enforceResourceAccess('MedicationDispense'))
    .input(
      z.object({
        prescriptionId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify current status — must be ACTIVE to complete
      const { data: current, error: fetchError } = await ctx.supabase
        .from('medication_requests')
        .select('id, prescription_status, status, interaction_check, subject_reference')
        .eq('id', input.prescriptionId)
        .single()

      if (fetchError || !current) {
        if (fetchError?.code === 'PGRST116') {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Prescription not found',
          })
        }
        console.error('Medication fetch error:', { code: fetchError?.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve prescription',
        })
      }

      const currentInvalidationStatus = toInvalidationStatus(current.prescription_status)

      if (current.prescription_status !== 'ACTIVE') {
        // Story 24.3: Paper prescriptions cannot go through digital dispensing workflow
        if (current.prescription_status === 'LEGACY_PAPER') {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Paper prescriptions cannot be processed through digital dispense workflow',
          })
        }
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Prescription cannot be fulfilled — current status: ${currentInvalidationStatus}`,
        })
      }

      // CLAUDE.md rule #3: Drug interaction checks must never be skipped silently
      if (current.interaction_check === 'BLOCKED') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Prescription has a blocked drug interaction — cannot dispense.',
        })
      }
      if (current.interaction_check === 'UNAVAILABLE') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Drug interaction check was unavailable for this prescription — cannot dispense without verification.',
        })
      }

      // Atomic conditional update — prevents TOCTOU race (double-dispense)
      const now = new Date().toISOString()
      const { data: updated, error: updateError } = await ctx.supabase
        .from('medication_requests')
        .update({
          status: 'completed',
          prescription_status: 'DISPENSED',
          dispensed_at: now,
          dispensed_by: ctx.user.sub,
          meta_last_updated: now,
        })
        .eq('id', input.prescriptionId)
        .eq('prescription_status', 'ACTIVE')
        .select('id, prescription_status, status, dispensed_at')
        .single()

      if (updateError || !updated) {
        // If no rows matched, another pharmacist fulfilled it between our read and write
        if (updateError?.code === 'PGRST116') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Prescription was fulfilled by another pharmacist — please re-scan.',
          })
        }
        console.error('Medication update error:', { code: updateError?.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update prescription status',
        })
      }

      // Story 10.1: Create MedicationStatement for the dispensed prescription
      await createMedicationStatementOnDispense(
        ctx.supabase,
        input.prescriptionId,
        '', // patientRef resolved from prescription inside helper
        ctx.user.sub,
        new Date().toISOString(), // HLC not available in complete — use ISO timestamp
      )

      // Audit PHI write — prescription status changed (CLAUDE.md Rule #6)
      const completeAudit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await completeAudit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PRESCRIPTION',
          resourceId: updated.id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          patientId: (current.subject_reference as string)?.replace('Patient/', ''),
          metadata: {
            previousStatus: currentInvalidationStatus,
            newStatus: toInvalidationStatus(updated.prescription_status),
          },
        })
      } catch (auditError) {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PRESCRIPTION', resourceId: updated.id })
      }

      return {
        success: true,
        prescriptionId: updated.id,
        previousStatus: currentInvalidationStatus,
        newStatus: toInvalidationStatus(updated.prescription_status) as 'FULFILLED',
        dispensedAt: updated.dispensed_at,
      }
    }),

  /**
   * Story 10.1 AC 4: Void a prescription and stop the corresponding MedicationStatement.
   * Transitions prescription to CANCELLED and MedicationStatement to stopped.
   */
  voidPrescription: protectedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('OPD_LITE'))
    .use(enforceResourceAccess('MedicationRequest'))
    .input(
      z.object({
        prescriptionId: z.string().uuid(),
        reason: z.string().min(1),
        hlcTimestamp: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()

      const { data: updated, error } = await ctx.supabase
        .from('medication_requests')
        .update({
          status: 'cancelled',
          prescription_status: 'CANCELLED',
          meta_last_updated: now,
        })
        .eq('id', input.prescriptionId)
        .eq('prescription_status', 'ACTIVE')
        .select('id, prescription_status, subject_reference')
        .single()

      if (error || !updated) {
        if (error?.code === 'PGRST116') {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Active prescription not found — may already be voided or dispensed',
          })
        }
        console.error('Prescription void error:', { code: error?.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to void prescription',
        })
      }

      // Story 10.1: Stop corresponding MedicationStatement
      await stopMedicationStatementOnVoid(
        ctx.supabase,
        input.prescriptionId,
        input.hlcTimestamp,
      )

      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PRESCRIPTION',
          resourceId: updated.id,
          patientId: (updated.subject_reference as string)?.replace('Patient/', ''),
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'void', reason: 'prescription_voided' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', {
          action: 'PHI_WRITE',
          resourceType: 'PRESCRIPTION',
          resourceId: updated.id,
        })
      }

      return {
        success: true,
        prescriptionId: updated.id,
        newStatus: 'VOIDED' as const,
      }
    }),

  /**
   * Story 24.3 AC #2: Generate a signed upload URL for paper prescription images.
   * Storage bucket: paper-prescriptions (private, PHARMACIST + ADMIN readable).
   * Only image/jpeg and image/png allowed. 15-minute upload window.
   */
  getPaperRxUploadUrl: roleRestrictedProcedure(['PHARMACIST', 'ADMIN'])
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('PHARMACY_LITE'))
    .input(
      z.object({
        contentType: z.enum(['image/jpeg', 'image/png']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const storageKey = `${ctx.user.sub}/${crypto.randomUUID()}-${Date.now()}`
      const expiresIn = 900 // 15 minutes

      const { data, error } = await ctx.supabase.storage
        .from('paper-prescriptions')
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
   * Story 24.3 AC #8, #9, #10, #11: Create a paper prescription record.
   * Stored with source: 'PAPER_OCR', prescription_status: 'LEGACY_PAPER'.
   * Cannot be digitally invalidated. No QR code. No drug interaction checks.
   */
  createPaperPrescription: roleRestrictedProcedure(['PHARMACIST'])
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('PHARMACY_LITE'))
    .input(
      z.object({
        patientId: z.string().uuid().optional(),
        medicationName: z.string().min(1),
        dosage: z.string().min(1),
        frequency: z.string().min(1),
        prescriberName: z.string().min(1),
        prescriptionDate: z.string().min(1),
        ocrConfidenceScores: z.record(z.string(), z.number().min(0).max(1)),
        imageStorageKey: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate imageStorageKey belongs to the authenticated user
      if (!input.imageStorageKey.startsWith(`${ctx.user.sub}/`)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid image storage key',
        })
      }

      const now = new Date().toISOString()
      const prescriptionId = crypto.randomUUID()

      const row = db.toRow({
        id: prescriptionId,
        resourceType: 'MedicationRequest',
        status: 'active',
        prescriptionStatus: 'LEGACY_PAPER',
        intent: 'order',
        medicationDisplay: input.medicationName,
        medicationText: `${input.dosage} - ${input.frequency}`,
        subjectReference: input.patientId ? `Patient/${input.patientId}` : null,
        requesterId: null,
        dosageInstruction: { text: `${input.dosage}, ${input.frequency}` },
        source: 'PAPER_OCR',
        manualVerificationRequired: true,
        ocrMetadata: {
          confidenceScores: input.ocrConfidenceScores,
          extractedAt: now,
          prescriberName: input.prescriberName,
          prescriptionDate: input.prescriptionDate,
          imageStorageKey: input.imageStorageKey,
        },
        interactionCheck: null,
        interactionOverride: null,
        qrCodeId: null,
        authoredOn: input.prescriptionDate,
        isOfflineCreated: false,
        hlcTimestamp: now,
        createdAt: now,
        metaLastUpdated: now,
        metaVersionId: '1',
      })

      const { error } = await ctx.supabase
        .from('medication_requests')
        .insert(row)

      if (error) {
        console.error('Paper prescription create error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create paper prescription',
        })
      }

      // Audit: PAPER_PRESCRIPTION_CREATED (AC #11)
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PAPER_PRESCRIPTION_CREATED',
          resourceType: 'PRESCRIPTION',
          resourceId: prescriptionId,
          patientId: input.patientId ?? undefined,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            source: 'PAPER_OCR',
            hasPatientId: !!input.patientId,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PAPER_PRESCRIPTION_CREATED', resourceType: 'PRESCRIPTION', resourceId: prescriptionId })
      }

      return {
        success: true,
        prescriptionId,
        status: 'LEGACY_PAPER' as const,
      }
    }),

  /**
   * Story 24.3 AC #8: Reject digital invalidation of LEGACY_PAPER prescriptions.
   * Paper prescriptions cannot be digitally invalidated.
   */
  invalidate: roleRestrictedProcedure(['PHARMACIST', 'DOCTOR', 'CLINICIAN'])
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('PHARMACY_LITE'))
    .use(enforceResourceAccess('MedicationRequest'))
    .input(
      z.object({
        prescriptionId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: rx, error: fetchError } = await ctx.supabase
        .from('medication_requests')
        .select('id, prescription_status, subject_reference')
        .eq('id', input.prescriptionId)
        .single()

      if (fetchError || !rx) {
        if (fetchError?.code === 'PGRST116') {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Prescription not found',
          })
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve prescription',
        })
      }

      // AC #8: Paper prescriptions cannot be digitally invalidated
      if (rx.prescription_status === 'LEGACY_PAPER') {
        // Audit the rejected access attempt (CLAUDE.md Rule #6)
        const rejectionAudit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
        try {
          await rejectionAudit.emit({
            action: 'PHI_READ',
            resourceType: 'PRESCRIPTION',
            resourceId: input.prescriptionId,
            patientId: (rx.subject_reference as string)?.replace('Patient/', ''),
            actorId: ctx.user.sub,
            actorRole: ctx.user.role,
            outcome: 'DENIED',
            sessionId: ctx.user.sessionId,
            metadata: { reason: 'LEGACY_PAPER_INVALIDATION_REJECTED' },
          })
        } catch {
          console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceId: input.prescriptionId })
        }
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Paper prescriptions cannot be digitally invalidated',
        })
      }

      const now = new Date().toISOString()
      const { data: updated, error: updateError } = await ctx.supabase
        .from('medication_requests')
        .update({
          status: 'cancelled',
          prescription_status: 'CANCELLED',
          meta_last_updated: now,
        })
        .eq('id', input.prescriptionId)
        .eq('prescription_status', 'ACTIVE')
        .select('id, prescription_status')
        .single()

      if (updateError || !updated) {
        if (updateError?.code === 'PGRST116') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Prescription is no longer active',
          })
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to invalidate prescription',
        })
      }

      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PRESCRIPTION',
          resourceId: updated.id,
          patientId: (rx.subject_reference as string)?.replace('Patient/', ''),
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'prescription_invalidated' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PRESCRIPTION', resourceId: updated.id })
      }

      return {
        success: true,
        prescriptionId: updated.id,
        newStatus: 'VOIDED' as const,
      }
    }),

  /**
   * Story 16.6: Server-side drug interaction check.
   * Queries patient's active medications + allergies and runs the check centrally.
   * RBAC: enforces MedicationRequest resource access.
   * CLAUDE.md Rule #3: Never return CLEAR on failure — return UNAVAILABLE.
   * CLAUDE.md Rule #6: Audit every PHI access.
   */
  checkInteractions: protectedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('OPD_LITE'))
    .use(enforceResourceAccess('MedicationRequest'))
    .input(
      z.object({
        medicationCode: z.string().min(1),
        medicationDisplay: z.string().min(1),
        patientId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const patientRef = `Patient/${input.patientId}`

      // 1. Query active MedicationStatements (select only fields needed by drug-db checker)
      const { data: statements, error: stmtError } = await ctx.supabase
        .from('medication_statements')
        .select('id, medication_codeable_concept, medication_display, subject_reference, status')
        .eq('subject_reference', patientRef)
        .eq('status', 'active')

      if (stmtError) {
        console.error('MedicationStatement query error:', { code: stmtError.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve active medication statements',
        })
      }

      // 2. Query pending MedicationRequests (ACTIVE prescriptions — only need display name)
      const { data: pendingRequests, error: rxError } = await ctx.supabase
        .from('medication_requests')
        .select('id, medication_display')
        .eq('subject_reference', patientRef)
        .eq('prescription_status', 'ACTIVE')

      if (rxError) {
        console.error('MedicationRequest query error:', { code: rxError.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve pending medication requests',
        })
      }

      // 3. Query active allergies (select fields needed by drug-db allergy matching).
      // Columns are substance_*; patient_ref is stored as a BARE UUID. The
      // substance text is field-encrypted — db.fromRow() decrypts it below.
      const { data: allergies, error: allergyError } = await ctx.supabase
        .from('allergy_intolerances')
        .select('id, substance_code, substance_text, substance_free_text, clinical_status_code, patient_ref')
        .eq('patient_ref', input.patientId)
        .eq('clinical_status_code', 'active')

      if (allergyError) {
        console.error('AllergyIntolerance query error:', { code: allergyError.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve active allergies',
        })
      }

      // 4. Extract display names from pending MedicationRequests
      const pendingRxNames = (pendingRequests ?? [])
        .map((rx) => rx.medication_display as string | null)
        .filter((name): name is string => !!name)

      // 5. Build adapter and run interaction check
      // CLAUDE.md Rule #3: Never return CLEAR on failure — catch any thrown error
      const adapter = createSupabaseDrugAdapter(ctx.supabase)
      const activeMedStatements = (statements ?? []).map((row) => db.fromRow(row))

      let result
      try {
        result = await checkInteractions(
          input.medicationDisplay,
          pendingRxNames,
          {
            activeMedications: activeMedStatements,
            // Reshape the flat (decrypted) allergy rows into the FHIR shape the
            // drug-db checker reads (allergy._ultranos.substanceFreeText / code.text).
            activeAllergies: (allergies ?? []).map((row) => {
              const a = db.fromRow(row) as Record<string, unknown>
              return {
                resourceType: 'AllergyIntolerance',
                code: { text: (a.substanceText as string) ?? undefined },
                _ultranos: { substanceFreeText: (a.substanceFreeText as string) ?? undefined },
              }
            }) as unknown as Parameters<typeof checkInteractions>[2]['activeAllergies'],
          },
          adapter,
        )
      } catch (checkError) {
        console.error('Drug interaction check error:', { code: (checkError as { code?: string })?.code })
        result = { result: 'UNAVAILABLE' as const, interactions: [], reason: 'ADAPTER_ERROR' as const }
      }

      // Story 23.2: Track interaction check completion vs failure
      drugInteractionChecksTotal.inc({ result: result.result })
      if (result.result === 'UNAVAILABLE') {
        prescriptionsWithoutInteractionCheckTotal.inc()
      }

      // 6. Audit PHI read (CLAUDE.md Rule #6)
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'INTERACTION_CHECK',
          resourceId: input.patientId,
          patientId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            medicationDisplay: input.medicationDisplay,
            result: result.result,
            interactionCount: result.interactions.length,
            ...(result.reason ? { reason: result.reason } : {}),
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', {
          action: 'PHI_READ',
          resourceType: 'INTERACTION_CHECK',
        })
      }

      return result
    }),

  /**
   * Story 24.2 Task 1: Generate dialect-tuned TTS audio for a prescription.
   * RBAC: PATIENT, GUARDIAN, DOCTOR, CLINICIAN.
   * Checks AI_PROCESSING consent before generating audio.
   * Returns a pre-signed Supabase Storage URL with 15-minute expiry.
   */
  generatePrescriptionAudio: protectedProcedure
    .input(
      z.object({
        medicationRequestId: z.string().uuid(),
        dialect: z.enum(['AR_LEVANTINE', 'AR_GULF', 'DARI', 'EN']),
        patientId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const allowedRoles = ['PATIENT', 'GUARDIAN', 'DOCTOR', 'CLINICIAN']
      if (!allowedRoles.includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions for TTS generation',
        })
      }

      // Ownership check: PATIENT/GUARDIAN can only access their own prescriptions
      if (['PATIENT', 'GUARDIAN'].includes(ctx.user.role) && ctx.user.sub !== input.patientId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot generate TTS for another patient',
        })
      }

      // AC #8: Check AI_PROCESSING consent
      const hasConsent = await checkAIProcessingConsent(ctx.supabase, input.patientId)
      if (!hasConsent) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'AI_PROCESSING_CONSENT_REQUIRED',
        })
      }

      // Fetch medication details (decrypt PHI fields)
      const { data: rxRow, error: rxError } = await ctx.supabase
        .from('medication_requests')
        .select('id, medication_display, medication_text, dosage_instruction, dispense_request, subject_reference')
        .eq('id', input.medicationRequestId)
        .single()

      if (rxError || !rxRow) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Medication request not found',
        })
      }

      const rx = db.fromRow(rxRow)

      // Verify medication belongs to the claimed patient
      const expectedRef = `Patient/${input.patientId}`
      if (rx.subjectReference && rx.subjectReference !== expectedRef) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Medication does not belong to the specified patient',
        })
      }

      // Build medication TTS input from prescription data
      const dosageObj = rx.dosageInstruction as Record<string, unknown> | null
      const dispenseObj = rx.dispenseRequest as Record<string, unknown> | null

      const ttsInput = {
        medicationName: rx.medicationDisplay ?? rx.medicationText ?? 'your medication',
        dosageInstruction: (dosageObj?.text as string) ?? (dosageObj?.dose as string) ?? 'Take as directed',
        frequency: (dosageObj?.frequency as string) ?? 'as directed by your doctor',
        duration: (dispenseObj?.duration as string) ?? (dosageObj?.duration as string) ?? '',
        timeOfDay: (dosageObj?.timeOfDay as string) ?? undefined,
        caution: (dosageObj?.caution as string) ?? undefined,
      }

      // Step 1: Build dialect-appropriate prompt text
      const promptText = buildTTSPrompt(ttsInput, input.dialect as TTSDialect)

      // Step 2: Synthesize audio via Cloud TTS API
      const ttsResult = await synthesizeSpeech(promptText, input.dialect as TTSDialect)

      if (isTTSError(ttsResult)) {
        // AC #5: Return explicit error, never silent failure
        throw new TRPCError({
          code: 'SERVICE_UNAVAILABLE',
          message: 'TTS_UNAVAILABLE',
        })
      }

      // Upload audio to Supabase Storage with a unique filename
      const audioFileName = `tts/${crypto.randomUUID()}.mp3`
      const { error: uploadError } = await ctx.supabase.storage
        .from('tts-audio')
        .upload(audioFileName, ttsResult.audio, {
          contentType: 'audio/mpeg',
          cacheControl: 'no-store',
        })

      if (uploadError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to upload audio',
        })
      }

      // Generate pre-signed URL with 15-minute expiry (AC #3)
      const expiresInSeconds = 15 * 60
      const { data: signedUrlData, error: signedUrlError } = await ctx.supabase.storage
        .from('tts-audio')
        .createSignedUrl(audioFileName, expiresInSeconds)

      if (signedUrlError || !signedUrlData?.signedUrl) {
        // Clean up orphaned audio file
        await ctx.supabase.storage.from('tts-audio').remove([audioFileName]).catch(() => {})
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate audio URL',
        })
      }

      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString()

      // Audio file cleanup handled by /api/cron/tts-cleanup (every 5 min)
      // — setTimeout is unreliable in serverless; cron ensures PHI deletion (PRD Section 9)

      // Audit: TTS_GENERATED — never log medication content (CLAUDE.md Rule #1)
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PRESCRIPTION',
          resourceId: input.medicationRequestId,
          patientId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            ttsAction: 'TTS_GENERATED',
            dialect: input.dialect,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', {
          action: 'PHI_READ',
          resourceType: 'PRESCRIPTION',
          ttsAction: 'TTS_GENERATED',
        })
      }

      return {
        audioUrl: signedUrlData.signedUrl,
        expiresAt,
        duration: null, // Audio duration could be extracted from the buffer but TTS APIs vary
        dialect: input.dialect,
      }
    }),

  /**
   * Story 24.2 Task 6: Log TTS playback completion.
   * Fire-and-forget from client — feeds the monthly clinical safety report
   * (Story 23.2 TTS playback completion rate metric).
   */
  logTTSPlayback: protectedProcedure
    .input(
      z.object({
        medicationRequestId: z.string().uuid(),
        patientId: z.string().uuid(),
        dialect: z.enum(['AR_LEVANTINE', 'AR_GULF', 'DARI', 'EN']),
        source: z.enum(['CLOUD_TTS', 'OFFLINE_FRAGMENT']),
        completedAt: z.string().datetime(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const allowedRoles = ['PATIENT', 'GUARDIAN', 'DOCTOR', 'CLINICIAN']
      if (!allowedRoles.includes(ctx.user.role)) {
        return { success: false }
      }

      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PRESCRIPTION',
          resourceId: input.medicationRequestId,
          patientId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            ttsAction: 'TTS_PLAYBACK_COMPLETED',
            dialect: input.dialect,
            source: input.source,
            completedAt: input.completedAt,
          },
        })
      } catch {
        // Playback logging is fire-and-forget — never block on failure
      }

      return { success: true }
    }),
})
