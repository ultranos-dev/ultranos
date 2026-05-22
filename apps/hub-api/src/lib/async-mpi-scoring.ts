import { computeMpiResult } from '@ultranos/mpi-engine'
import { fetchMpiCandidates } from '@/lib/mpi-candidate-query'

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

      // Create a review entry
      await supabase.from('duplicate_reviews').insert({
        patient_id: patientId,
        candidate_ids: mpiResult.candidates.map((c: any) => c.candidate.id),
        top_score: mpiResult.topScore,
        mpi_decision: mpiResult.decision,
        status: 'PENDING',
      })
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
