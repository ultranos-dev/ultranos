// ---------------------------------------------------------------------------
// Story 54.2 — CHW Collection Module Types
// Data minimization: CHWSampleCollection stores patientFirstName + patientAge only.
// No DOB, no full name, no diagnosis (CLAUDE.md Rule #7).
// Sync lifecycle: pending → synced via store-and-forward queue.
// ---------------------------------------------------------------------------

export type CHWSampleType = 'blood' | 'urine' | 'swab' | 'stool' | 'other'
export type CHWSyncStatus = 'pending' | 'synced'

/**
 * A single sample collected by a CHW in the field.
 * patientRef is an opaque patient reference (Patient/<uuid> or temp-<uuid> if unlinked).
 * patientFirstName + patientAge are the ONLY PHI stored (CLAUDE.md Rule #7).
 */
export interface CHWSampleCollection {
  id: string                    // UUID — durable offline key
  patientRef: string            // opaque Patient/<uuid> — never a name
  patientFirstName: string      // first name ONLY (CLAUDE.md Rule #7)
  patientAge: number            // computed age, NOT DOB
  sampleType: CHWSampleType
  labelNumber: string           // e.g. "CHW-0531-001"
  collectedBy: string           // CHW practitioner ID
  collectedAt: string           // HLC timestamp
  location?: {                  // optional GPS — device may not have GPS
    lat: number
    lng: number
  }
  syncStatus: CHWSyncStatus
}

/**
 * A courier handoff record: documents which samples left the health post
 * with which courier, and when.
 */
export interface CourierHandoff {
  id: string                    // UUID
  courierId: string             // courier badge ID or name
  sampleIds: string[]           // CHWSampleCollection.id[]
  sampleCount: number           // redundant count for quick display
  pickupTimestamp: string       // HLC timestamp
  temperatureAtPickup?: number  // optional — °C
  notes?: string
  syncStatus: CHWSyncStatus
}

// ---------------------------------------------------------------------------
// Input types for service layer
// ---------------------------------------------------------------------------

export interface CollectSampleInput {
  patientRef: string
  patientFirstName: string
  patientAge: number
  sampleType: CHWSampleType
  collectedBy: string
  location?: { lat: number; lng: number }
}

export interface CourierHandoffInput {
  courierId: string
  sampleIds: string[]
  temperatureAtPickup?: number
  notes?: string
  collectedBy?: string  // CHW practitioner ID for audit trail
}
