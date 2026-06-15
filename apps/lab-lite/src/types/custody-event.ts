/**
 * CustodyEvent — append-only log entry for every sample custody handoff,
 * status change, or rejection. Never updated or deleted after creation
 * (Tier 1 append-only philosophy from sync engine).
 *
 * All actor fields use opaque practitioner UUIDs — never names (CLAUDE.md Rule #7).
 */
export type CustodyEventType =
  | 'received'
  | 'handoff'
  | 'status-change'
  | 'rejection'
  | 'transport-pickup'
  | 'transport-delivery'

export interface CustodyEvent {
  id: string // UUID
  sampleId: string // FK to samples table (FhirSpecimen.id)
  eventType: CustodyEventType
  fromActorId: string // practitioner UUID — opaque, never a name
  toActorId: string // practitioner UUID — opaque, never a name
  timestamp: string // HLC-serialized for causal ordering
  notes?: string
  location?: string
  /** For status-change events: the status before this transition */
  fromStatus?: string
  /** For status-change events: the new status after this transition */
  toStatus?: string
  /** For transport-pickup and transport-delivery events: FK to transport_sessions */
  transportSessionId?: string
  /** For transport events: ambient temperature at the time of event (Celsius) */
  temperature?: number
}
