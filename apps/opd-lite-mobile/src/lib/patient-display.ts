/**
 * Shared display helpers for patient data.
 * Used by PatientResultList, PatientSummaryScreen, and any future patient-facing views.
 */
import type { FhirPatient } from '@ultranos/shared-types'

/**
 * Format patient age from FHIR birthDate.
 * - birthYearOnly: prefix with ~ for approximate ages
 * - Children <2y: display in months
 * - Others: display in years
 */
export function formatAge(birthDate?: string, birthYearOnly?: boolean): string {
  if (!birthDate) return ''

  const now = new Date()
  const birth = new Date(birthDate)

  if (isNaN(birth.getTime())) return ''

  let years = now.getFullYear() - birth.getFullYear()
  if (
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
  ) {
    years--
  }

  if (years < 0) return ''

  if (birthYearOnly) {
    return `~${years}y`
  }

  if (years < 2) {
    const months = (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth()
    return months <= 0 ? '<1m' : `${months}m`
  }

  return `${years}y`
}

/**
 * Display national ID with masking rules:
 * - ≤4 chars: mask entirely (****)
 * - >40 chars: hash, hide entirely
 * - Otherwise: show last 4 chars
 */
export function getIdentifierDisplay(patient: FhirPatient): string {
  const hash = patient._ultranos?.nationalIdHash
  if (!hash) return ''
  // Hash values (>40 chars) — don't display
  if (hash.length > 40) return ''
  // Short values — mask
  if (hash.length <= 4) return '****'
  // Show last 4 chars
  return `***${hash.slice(-4)}`
}
