'use client'

import { Button } from '@/components/ui/Button'

interface BiometricStaleBannerProps {
  currentVersion: string | null
  expectedVersion: string // from NEXT_PUBLIC_BIOMETRIC_ALGORITHM_VERSION env var
  onUpdateBiometric: () => void
}

/**
 * Informational blue banner displayed when the patient's biometric
 * algorithm version is outdated or missing. Prompts the clinician
 * to re-enrol biometrics for improved matching accuracy.
 */
export function BiometricStaleBanner({
  currentVersion,
  expectedVersion,
  onUpdateBiometric,
}: BiometricStaleBannerProps) {
  if (currentVersion === expectedVersion) {
    return null
  }

  return (
    <div
      role="status"
      className="mb-4 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-800"
    >
      <div className="flex items-center justify-between gap-3">
        <p>
          A newer biometric algorithm is available. Re-enrolling improves
          matching accuracy.
        </p>
        <Button
          variant="primary"
          className="shrink-0"
          type="button"
          onClick={onUpdateBiometric}
        >
          Update Biometric
        </Button>
      </div>
    </div>
  )
}
