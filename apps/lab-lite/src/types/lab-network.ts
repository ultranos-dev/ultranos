/**
 * Lab Network types — Multi-Branch Lab Network Management
 * Story 54.1 / Task 1.1
 *
 * LabLocation maps to FHIR R4 Location resource.
 * Ultranos-specific extensions live in the _ultranos namespace.
 * The meta object follows FHIR R4 Meta conventions (lastUpdated, versionId).
 */

/** Represents a physical lab location — either the main lab or a satellite. */
export interface LabLocation {
  /** UUID */
  id: string
  name: string
  /** Whether this is the primary lab or a downstream satellite */
  type: 'main' | 'satellite'
  /** Operational capability: full-service processing vs. sample collection only */
  mode: 'full' | 'collection-only'
  status: 'active' | 'inactive'
  address?: string
  coordinates?: { lat: number; lng: number }
  /** FK to the main lab for satellites; undefined for main labs */
  parentLabId?: string
  /** Location-specific configuration (equipment, test panels, etc.) */
  settings: Record<string, unknown>
  /** FHIR R4 Meta fields */
  meta: {
    /** ISO 8601 instant */
    lastUpdated: string
    versionId: string
  }
  /** Ultranos extension namespace */
  _ultranos: {
    /** ISO 8601 */
    createdAt: string
    /** HLC serialized timestamp */
    hlcTimestamp: string
  }
}

/** Input type for creating a new lab location. */
export interface CreateLocationInput {
  name: string
  type: 'main' | 'satellite'
  mode: 'full' | 'collection-only'
  address?: string
  coordinates?: { lat: number; lng: number }
  /** Required when type === 'satellite' */
  parentLabId?: string
  settings?: Record<string, unknown>
}

/** Point-in-time connectivity and operational snapshot for a single location. */
export interface NetworkStatusSnapshot {
  locationId: string
  pendingSamples: number
  stockAlerts: number
  staffOnDuty: number
  /** ISO 8601 */
  lastSyncTimestamp: string
  connectivityStatus: 'online' | 'offline' | 'degraded'
}

/** Aggregated metrics across all locations in the network. */
export interface NetworkMetrics {
  totalSamplesToday: number
  /** locationId -> turnaround time in minutes */
  avgTATByLocation: Record<string, number>
  /** locationId -> pending result count */
  pendingResultsByLocation: Record<string, number>
  stockoutAlerts: number
  /** ISO 8601 timestamp indicating when these metrics were computed */
  asOf: string
}
