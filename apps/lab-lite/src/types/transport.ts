/**
 * Transport types for Courier & Sample Transport Tracking (Story 54.3).
 *
 * PHI rules (CLAUDE.md):
 *   Rule #1: No PHI in logs or error messages — use opaque IDs only.
 *   Rule #7: Lab Portal endpoints return ONLY first name + age for patient verification.
 *            Transport records MUST NOT contain demographics, diagnosis, or other PHI.
 *            courierId, sampleIds, and locationIds are all opaque identifiers.
 */

// TransportSession — a single courier run from origin to destination
export interface TransportSession {
  id: string                     // UUID
  courierId: string              // practitioner ID (opaque)
  originLocationId: string       // FK to lab_locations
  destinationLocationId: string  // FK to lab_locations
  status: 'in-transit' | 'delivered' | 'flagged'
  pickupTimestamp: string        // ISO 8601 wall-clock (used for stability window calculations)
  deliveryTimestamp: string | null // ISO 8601 wall-clock, null until delivered
  pickupTemperature: number | null  // Celsius, optional
  deliveryTemperature: number | null // Celsius, optional
  sampleIds: string[]            // array of FhirSpecimen IDs
  sampleCount: number
  conditionAtDelivery: 'acceptable' | 'damaged' | 'temperature-excursion' | null
  flags: TransportFlag[]         // stability/condition flags
  estimatedTransitMinutes: number | null // from network config
  meta: { lastUpdated: string; versionId: string }
  _ultranos: { createdAt: string; syncStatus: 'pending' | 'synced' | 'failed' }
}

// TransportFlag — attached to TransportSession.flags AND to individual sample records
export interface TransportFlag {
  sampleId: string    // FhirSpecimen.id (opaque)
  labSampleId: string // human-readable label (e.g. "L2026-001")
  flagType: 'stability-exceeded' | 'temperature-excursion' | 'damaged'
  message: string     // human-readable, e.g. "Sample L2026-001 exceeded 6-hour stability window"
  timestamp: string   // ISO 8601
}

// SampleStabilityWindow — mapping of sample type to max transit hours at ambient temperature
// Keys are sample type category names (blood, urine, swab, csf, stool)
export type SampleStabilityWindow = Record<string, number>

// Default stability windows in HOURS at ambient temperature (configurable per lab)
export const DEFAULT_STABILITY_WINDOWS: SampleStabilityWindow = {
  blood: 6,
  urine: 2,
  swab: 24,
  csf: 1,
  stool: 24,
}

// Input types for transport service functions
export interface StartTransportInput {
  courierId: string
  originLocationId: string
  destinationLocationId: string
  sampleIds: string[]          // FhirSpecimen IDs
  pickupTemperature?: number   // optional — thermometers not always available in rural Afghanistan
  estimatedTransitMinutes?: number
}

export interface DeliveryInput {
  deliveryTemperature?: number
  conditionAtDelivery: 'acceptable' | 'damaged' | 'temperature-excursion'
}

// TransportManifest — printable/displayable courier manifest
export interface TransportManifest {
  sessionId: string
  courierId: string
  originName: string
  destinationName: string
  pickupTimestamp: string        // ISO 8601
  expectedArrival: string | null // ISO 8601
  // Each entry: label number + sample type ONLY — no patient data (CLAUDE.md Rule #7)
  samples: Array<{
    labSampleId: string
    sampleType: string
  }>
  sampleCount: number
}
