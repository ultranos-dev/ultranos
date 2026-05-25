'use client'

import type { FhirPatient } from '@ultranos/shared-types'
import { AllergyBanner } from '@/components/clinical/AllergyBanner'
import { ConflictBanner } from '@/components/sync/ConflictBanner'
import { MpiWarnBanner } from '@/components/patient/MpiWarnBanner'
import { NidMissingBanner } from '@/components/patient/NidMissingBanner'
import { ConsentExpiryBanner } from '@/components/patient/ConsentExpiryBanner'
import { BiometricStaleBanner } from '@/components/patient/BiometricStaleBanner'

interface PatientBannerStackProps {
  patient: FhirPatient
  patientId: string
  consentExpiryDate?: string | null
}

const EXPECTED_BIOMETRIC_VERSION =
  process.env.NEXT_PUBLIC_BIOMETRIC_ALGORITHM_VERSION ?? '1.0'

/**
 * Composes all safety banners in clinical priority order.
 * CLAUDE.md Rule #4: Allergies render FIRST, in red, never collapsed.
 *
 * Order:
 * 1. AllergyBanner — always rendered (handles its own empty/error states)
 * 2. ConflictBanner — always rendered (hides itself when no Tier 1 conflicts)
 * 3. MpiWarnBanner — when MPI duplicate score > 0
 * 4. NidMissingBanner — when no national ID hash
 * 5. ConsentExpiryBanner — when consent expiry date is provided
 * 6. BiometricStaleBanner — when biometric algorithm version mismatches expected
 */
export function PatientBannerStack({
  patient,
  patientId,
  consentExpiryDate,
}: PatientBannerStackProps) {
  const mpiScore = patient._ultranos.mpiScore
  const hasNationalId = !!patient._ultranos.nationalIdHash
  const currentBiometricVersion =
    patient._ultranos.biometricAlgorithmVersion ?? null

  return (
    <div data-testid="patient-banner-stack">
      {/* 1. Allergies — ALWAYS first, never collapsed (CLAUDE.md Rule #4) */}
      <AllergyBanner patientId={patientId} />

      {/* 2. Sync conflicts — always rendered, self-hides when empty */}
      <ConflictBanner patientId={patientId} />

      {/* 3. MPI duplicate warning — only when score > 0 */}
      {mpiScore != null && mpiScore > 0 && (
        <MpiWarnBanner mpiScore={mpiScore} patientId={patientId} />
      )}

      {/* 4. NID missing — only when no national ID hash */}
      {!hasNationalId && <NidMissingBanner />}

      {/* 5. Consent expiry — only when expiry date provided */}
      {consentExpiryDate && (
        <ConsentExpiryBanner
          patientId={patientId}
          expiryDate={consentExpiryDate}
        />
      )}

      {/* 6. Biometric stale — only when version mismatches */}
      <BiometricStaleBanner
        currentVersion={currentBiometricVersion}
        expectedVersion={EXPECTED_BIOMETRIC_VERSION}
        onUpdateBiometric={() => {
          // TODO: Navigate to biometric enrollment flow
        }}
      />
    </div>
  )
}
