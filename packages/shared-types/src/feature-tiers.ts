/**
 * Feature tier definitions — single source of truth for free/premium gating.
 * Story 27.11: Freemium Tier Definition & Feature Gating
 *
 * Shared between Hub API (middleware enforcement) and Patient Lite Mobile (UI gating).
 */

export const FREE_FEATURES = [
  'HEALTH_PASSPORT_QR',
  'VIEW_ACTIVE_MEDICATIONS',
  'VIEW_ALLERGIES',
  'LANGUAGE_SELECTION',
  'CONSENT_MANAGEMENT',
  'BASIC_APPOINTMENT_HISTORY',
] as const

export const PREMIUM_FEATURES = [
  'MEDICAL_HISTORY_EXPORT',
  'GUARDIAN_LINKING',
  'NOTIFICATION_CENTER',
  'PRESCRIPTION_HISTORY',
  'PRIORITY_SUPPORT',
] as const

/**
 * Safety-critical features that must NEVER be gated behind premium.
 * Per CLAUDE.md healthcare safety rules: allergies always visible, drug interactions
 * never skipped, consent management is a patient right.
 */
export const SAFETY_CRITICAL_FEATURES = [
  'VIEW_ALLERGIES',
  'VIEW_ACTIVE_MEDICATIONS',
  'CONSENT_MANAGEMENT',
] as const

export type FreeFeatureId = (typeof FREE_FEATURES)[number]
export type PremiumFeatureId = (typeof PREMIUM_FEATURES)[number]
export type FeatureId = FreeFeatureId | PremiumFeatureId

export type PatientTier = 'FREE' | 'PREMIUM'

const premiumSet = new Set<string>(PREMIUM_FEATURES)
const safetyCriticalSet = new Set<string>(SAFETY_CRITICAL_FEATURES)

export function isFeaturePremium(featureId: FeatureId): boolean {
  return premiumSet.has(featureId)
}

export function isSafetyCritical(featureId: FeatureId): boolean {
  return safetyCriticalSet.has(featureId)
}

/**
 * Registry mapping Hub API endpoint names to premium feature IDs.
 * Used for documentation and safety validation tests.
 *
 * Endpoints marked 'future' do not exist yet — middleware application
 * is documented here for when they are created.
 */
export const PREMIUM_ENDPOINT_REGISTRY: Record<string, { featureId: PremiumFeatureId; status: 'active' | 'future' }> = {
  // Guardian linking (Story 18.7a) — exists, middleware applied
  'guardian.verifyOtp': { featureId: 'GUARDIAN_LINKING', status: 'active' },
  'guardian.createLink': { featureId: 'GUARDIAN_LINKING', status: 'active' },
  'guardian.notifyUnlink': { featureId: 'GUARDIAN_LINKING', status: 'active' },
  // Medical history export — future endpoint
  'patient.exportHistory': { featureId: 'MEDICAL_HISTORY_EXPORT', status: 'future' },
  // Notification center (patient-facing) — future endpoint
  'notification.listPatientNotifications': { featureId: 'NOTIFICATION_CENTER', status: 'future' },
  // Prescription history with refill tracking — future endpoint
  'medication.prescriptionHistory': { featureId: 'PRESCRIPTION_HISTORY', status: 'future' },
}
