import { TRPCError } from '@trpc/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ConsentScope, ConsentStatus } from '@ultranos/shared-types'

/**
 * Maps tRPC resource types to the ConsentScope required for access.
 * Used by the enforcement middleware to determine which consent category
 * must be active before returning patient data.
 */
const RESOURCE_TO_SCOPE: Record<string, ConsentScope> = {
  Patient: ConsentScope.FULL_RECORD,
  Encounter: ConsentScope.CLINICAL_NOTES,
  MedicationRequest: ConsentScope.PRESCRIPTIONS,
  DiagnosticReport: ConsentScope.LABS,
  Observation: ConsentScope.VITALS,
}

export interface ConsentCheckInput {
  patientId: string
  resourceType: string
}

/**
 * Check if an active FHIR Consent exists for the given patient and resource type.
 *
 * Privacy by Design: if no consent is found, access is DENIED by default
 * for non-emergency contexts (CLAUDE.md Developer Guardrails).
 *
 * Returns true if access is permitted, false otherwise.
 */
export async function checkConsent(
  supabase: SupabaseClient,
  input: ConsentCheckInput,
): Promise<boolean> {
  const requiredScope = RESOURCE_TO_SCOPE[input.resourceType]
  if (!requiredScope) {
    // Unknown resource type — deny by default (Privacy by Design)
    return false
  }

  // Fetch all consent records for this patient and scope to find the latest per category.
  // Since the ledger is append-only, we must check the latest record per scope
  // to determine if consent is currently active or withdrawn.
  const { data, error } = await supabase
    .from('consents')
    .select('id, status, category, date_time, provision_end')
    .eq('patient_ref', `Patient/${input.patientId}`)
    .order('date_time', { ascending: false })

  if (error) {
    // Log shape only — never PHI
    console.error('Consent check query error:', { code: error.code })
    // On error, deny access (Privacy by Design)
    return false
  }

  if (!data || data.length === 0) {
    return false
  }

  // Find the latest consent record for the required scope (or FULL_RECORD).
  // The query is ordered newest-first, so the first match per scope is authoritative.
  const scopesToCheck = [requiredScope, ConsentScope.FULL_RECORD]
  for (const scope of scopesToCheck) {
    const latest = data.find((consent) => {
      const categories: string[] = Array.isArray(consent.category) ? consent.category : []
      return categories.includes(scope)
    })
    if (latest && latest.status === ConsentStatus.ACTIVE) {
      // Reject expired consent grants — a consent with provision_end in the past
      // is no longer active regardless of status field (privacy enforcement).
      if (latest.provision_end && latest.provision_end < new Date().toISOString()) {
        continue
      }
      return true
    }
  }

  return false
}

/**
 * tRPC middleware factory that enforces consent before returning patient data.
 *
 * Usage in a router:
 *   .use(enforceConsentMiddleware('MedicationRequest'))
 *
 * Expects `input.patientId` or `input.patientRef` in the procedure input.
 * If no active consent is found, throws a 403 FORBIDDEN error.
 */
export function enforceConsentMiddleware(resourceType: string) {
  return async (opts: {
    ctx: { supabase: SupabaseClient; user: { sub: string; role: string; sessionId: string } }
    input: Record<string, unknown>
    next: (opts: { ctx: typeof opts.ctx }) => Promise<unknown>
  }) => {
    // Extract patient ID from input — support both formats
    const patientId =
      (opts.input.patientId as string) ??
      (opts.input.patientRef as string)?.replace('Patient/', '')

    if (!patientId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Patient identifier is required for consent check',
      })
    }

    const hasConsent = await checkConsent(opts.ctx.supabase, {
      patientId,
      resourceType,
    })

    if (!hasConsent) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Access denied — no active consent from patient for this data category',
      })
    }

    return opts.next({ ctx: opts.ctx })
  }
}
