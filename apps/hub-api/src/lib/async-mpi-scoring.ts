import { computeMpiResult } from '@ultranos/mpi-engine'
import { fetchMpiCandidates } from '@/lib/mpi-candidate-query'
import { AuditLogger } from '@ultranos/audit-logger'
import { produceNotifications, resolveOrgAdmins } from '@/lib/notification-producers'

interface AsyncMpiInput {
  nameGiven?: string
  nameFather?: string
  nameGrandfather?: string
  birthYear?: number
  gender?: string
  phone?: string
  nationalIdHash?: string
  tazkiraPaperHash?: string
  biometricFingerprintHash?: string
  addressDistrictOrigin?: string
  addressProvinceOrigin?: string
}

/**
 * Runs MPI scoring asynchronously after a sync-created patient is inserted.
 * Fire-and-forget: errors are logged, never thrown.
 *
 * If WARN or BLOCK: sets mpi_warn=true, mpi_score, creates a duplicate_reviews row.
 * If ALLOW: sets mpi_score only.
 */
export async function runAsyncMpiScoring(
  patientId: string,
  fields: AsyncMpiInput,
  supabase: { from: (table: string) => any; rpc?: any },
  orgId?: string | null,
): Promise<void> {
  try {
    const candidates = await fetchMpiCandidates(supabase as any, {
      nameGiven: fields.nameGiven,
      nameFather: fields.nameFather,
      nationalId: undefined,
      tazkiraPaperHash: fields.tazkiraPaperHash,
      biometricFingerprintHash: fields.biometricFingerprintHash,
      birthYear: fields.birthYear,
      addressDistrictOrigin: fields.addressDistrictOrigin,
      phone: fields.phone,
    })

    // Exclude self from candidates
    const filteredCandidates = candidates.filter(
      (c: { id: string }) => c.id !== patientId
    )

    const mpiResult = computeMpiResult(filteredCandidates, {
      nameGiven: fields.nameGiven,
      nameFather: fields.nameFather,
      nameGrandfather: fields.nameGrandfather,
      birthYear: fields.birthYear,
      gender: fields.gender,
      addressDistrictOrigin: fields.addressDistrictOrigin,
      addressProvinceOrigin: fields.addressProvinceOrigin,
      phone: fields.phone,
      nationalIdHash: fields.nationalIdHash,
      tazkiraPaperHash: fields.tazkiraPaperHash,
      biometricFingerprintHash: fields.biometricFingerprintHash,
    })

    if (mpiResult.decision === 'WARN' || mpiResult.decision === 'BLOCK') {
      // Flag the patient
      await supabase
        .from('patients')
        .update({ mpi_warn: true, mpi_score: mpiResult.topScore })
        .eq('id', patientId)

      // Create a review entry. candidate_ids and candidate_scores are parallel
      // arrays derived from the same ordered mpiResult.candidates list, so
      // candidate_scores[i] is the score for candidate_ids[i]. Scores are frozen
      // here at flag time — the reviewer adjudicates what the system matched.
      const { data: reviewRow } = await supabase.from('duplicate_reviews').insert({
        patient_id: patientId,
        candidate_ids: mpiResult.candidates.map((c: any) => c.candidate.id),
        candidate_scores: mpiResult.candidates.map((c: any) => c.score),
        top_score: mpiResult.topScore,
        mpi_decision: mpiResult.decision,
        status: 'PENDING',
      }).select('id').single()

      const reviewId = (reviewRow as { id?: string } | null)?.id ?? patientId

      // Story 60.4 (Task 3 / AC 5): a PENDING duplicate review was previously
      // stranded until an admin happened to open the review queue. Emit an audit
      // event AND notify org admins so the review is actively surfaced.
      // PHI-safe: opaque reviewId + non-PHI decision enum only — never names.
      try {
        const audit = new AuditLogger(supabase as any, orgId ?? undefined)
        await audit.emit({
          action: 'CREATE',
          // Patient-scoped (a duplicate review concerns a patient identity) —
          // there is no dedicated DUPLICATE_REVIEW resource type in the shared
          // enum, and this story does not modify packages/shared-types.
          resourceType: 'PATIENT',
          resourceId: patientId,
          actorId: 'SYSTEM',
          actorRole: 'SYSTEM',
          outcome: 'SUCCESS',
          metadata: {
            operation: 'mpi_duplicate_review_created',
            reviewId,
            mpiDecision: mpiResult.decision,
            topScore: mpiResult.topScore,
            producer: 'story-60.4',
          },
        })
      } catch (auditErr: any) {
        console.warn('[ASYNC_MPI] Review audit failed:', { code: auditErr?.code })
      }

      try {
        const admins = await resolveOrgAdmins(supabase as any, orgId)
        await produceNotifications({
          supabase: supabase as any,
          type: 'MPI_REVIEW_PENDING',
          recipientRefs: admins,
          recipientRole: 'ADMIN',
          payload: { reviewId, status: mpiResult.decision },
          orgId,
        })
      } catch (notifyErr: any) {
        console.warn('[ASYNC_MPI] Review notification failed:', { code: notifyErr?.code })
      }
    } else {
      // ALLOW — just set the score for reference
      await supabase
        .from('patients')
        .update({ mpi_score: mpiResult.topScore })
        .eq('id', patientId)
    }
  } catch (err: any) {
    // Fire-and-forget: log but never throw
    console.error('[ASYNC_MPI] Scoring failed:', { patientId, code: err?.code })
  }
}
