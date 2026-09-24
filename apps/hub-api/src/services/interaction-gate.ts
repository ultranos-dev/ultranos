import type { SupabaseClient } from '@supabase/supabase-js'
import { checkInteractions, type InteractionCheckOptions, type InteractionCheckSummary } from '@ultranos/drug-db'
import { db } from '@/lib/supabase'
import { createSupabaseDrugAdapter } from '@/lib/supabase-drug-adapter'

/**
 * Story 57.2 — Authoritative server-side drug-interaction gate (shared service).
 *
 * Extracted from the previously orphaned `medication.checkInteractions` tRPC query
 * so the SAME fail-safe check logic is invoked at prescription create AND dispense
 * time — the client-attested value is never the enforcement input (H-HUB-1/H-HUB-2).
 *
 * CLAUDE.md Rule #3: never returns CLEAR on failure. Any query error, adapter
 * failure, empty/stale database → `UNAVAILABLE` (never a silent false-negative).
 * This function does NOT throw; a thrown error from a dependency is caught and
 * mapped to UNAVAILABLE so a create/dispense caller can never accidentally treat
 * a failed check as clear.
 *
 * The allergy dimension uses the Hub's OWN allergy record (Story 57.1 coordination)
 * — the Hub has it even when the client does not.
 *
 * CLAUDE.md Rule #1/#6: this service does not emit audit events or log PHI; the
 * caller owns audit emission with the appropriate resource/actor context.
 */
export async function computeServerInteractionStatus(
  supabase: SupabaseClient,
  input: { medicationDisplay: string; patientId: string },
): Promise<InteractionCheckSummary> {
  const patientRef = `Patient/${input.patientId}`

  try {
    // 1. Active MedicationStatements (only fields the drug-db checker needs).
    const { data: statements, error: stmtError } = await supabase
      .from('medication_statements')
      .select('id, medication_codeable_concept, medication_display, subject_reference, status')
      .eq('subject_reference', patientRef)
      .eq('status', 'active')
    if (stmtError) {
      // Rule #3: a query failure is UNAVAILABLE, never CLEAR.
      console.error('[interaction-gate] MedicationStatement query error:', { code: stmtError.code })
      return { result: 'UNAVAILABLE', interactions: [], reason: 'ADAPTER_ERROR' }
    }

    // 2. Pending (ACTIVE) MedicationRequests — only the display name is needed.
    const { data: pendingRequests, error: rxError } = await supabase
      .from('medication_requests')
      .select('id, medication_display')
      .eq('subject_reference', input.patientId) // bare id — sync storage convention
      .eq('prescription_status', 'ACTIVE')
    if (rxError) {
      console.error('[interaction-gate] MedicationRequest query error:', { code: rxError.code })
      return { result: 'UNAVAILABLE', interactions: [], reason: 'ADAPTER_ERROR' }
    }

    // 3. Active allergies (substance text field-encrypted — db.fromRow decrypts).
    const { data: allergies, error: allergyError } = await supabase
      .from('allergy_intolerances')
      .select('id, substance_code, substance_text, substance_free_text, clinical_status_code, patient_ref')
      .eq('patient_ref', input.patientId)
      .eq('clinical_status_code', 'active')
    if (allergyError) {
      console.error('[interaction-gate] AllergyIntolerance query error:', { code: allergyError.code })
      return { result: 'UNAVAILABLE', interactions: [], reason: 'ADAPTER_ERROR' }
    }

    const pendingRxNames = (pendingRequests ?? [])
      .map((rx) => rx.medication_display as string | null)
      .filter((name): name is string => !!name)

    const adapter = createSupabaseDrugAdapter(supabase)
    const activeMedStatements = (statements ?? []).map((row) => db.fromRow(row))

    return await checkInteractions(
      input.medicationDisplay,
      pendingRxNames,
      {
        activeMedications: activeMedStatements as unknown as InteractionCheckOptions['activeMedications'],
        activeAllergies: (allergies ?? []).map((row) => {
          const a = db.fromRow(row) as Record<string, unknown>
          return {
            resourceType: 'AllergyIntolerance',
            code: { text: (a.substanceText as string) ?? undefined },
            _ultranos: { substanceFreeText: (a.substanceFreeText as string) ?? undefined },
          }
        }) as unknown as InteractionCheckOptions['activeAllergies'],
      },
      adapter,
    )
  } catch (checkError) {
    // Rule #3: any unexpected failure → UNAVAILABLE, never CLEAR.
    console.error('[interaction-gate] check failed:', { code: (checkError as { code?: string })?.code })
    return { result: 'UNAVAILABLE', interactions: [], reason: 'ADAPTER_ERROR' }
  }
}
