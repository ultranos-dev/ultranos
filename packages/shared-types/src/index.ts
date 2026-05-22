// Barrel export — all shared types and enums
export * from './enums.js'
export * from './fhir/patient.js'
export * from './fhir/practitioner.js'
export * from './fhir/consent.js'
export * from './fhir/audit-event.js'

// Shared FHIR R4 building-block schemas
export * from './fhir/common.schema.js'

// Prescription types
export * from './prescription.js'

// Clinical utilities
export * from './utils/clinical.js'

// Zod schemas for FHIR R4 resources
export * from './fhir/patient.schema.js'
export * from './fhir/encounter.schema.js'
export * from './fhir/medication-request.schema.js'
export * from './fhir/clinical-impression.schema.js'
export * from './fhir/observation.schema.js'
export * from './fhir/condition.schema.js'
export * from './fhir/allergy-intolerance.schema.js'
export * from './fhir/medication-statement.schema.js'
export * from './fhir/diagnostic-report.schema.js'
export * from './fhir/medication-dispense.schema.js'

// SOAP ledger AI types
export * from './fhir/soap-ledger.js'

// Lab registration types
export * from './fhir/lab-registration.js'

// KYC types
export * from './fhir/kyc.js'

// Subscription constants
export * from './subscription.js'

// Admin types
export * from './admin/anomaly-alert.js'

// AI model registry types (Story 24.4)
export * from './ai-model.js'

// Guardian link types (Story 18.7)
export * from './fhir/guardian-link.js'

// Feature tier definitions (Story 27.11)
export * from './feature-tiers.js'

// Afghanistan geographic reference data
export { AFGHAN_PROVINCES } from './reference/afghanistan-geo.js'
export type { AfghanProvince } from './reference/afghanistan-geo.js'
