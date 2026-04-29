import type { AuditAction, AuditOutcome, AuditResourceType, UserRole } from '../enums.js'

// PRD Section 12 — Immutable Audit Event
// Append-only with SHA-256 hash chaining
export interface AuditEvent {
  id: string               // UUID
  timestamp: string        // ISO 8601 UTC microsecond-precision
  actorId?: string         // User UUID or undefined for anonymous
  actorRole: UserRole
  action: AuditAction
  resourceType: AuditResourceType
  resourceId?: string      // UUID of accessed resource
  patientId?: string       // Denormalized patient UUID for fast PHI queries
  sessionId?: string
  deviceId?: string
  sourceIpHash?: string    // SHA-256 hashed IP — never store raw per GDPR
  outcome: AuditOutcome
  denialReason?: string    // Populated on DENIED outcome
  chainHash: string        // SHA-256(prev_event_hash + this_event_data)
  metadata?: Record<string, unknown> // non-PHI context only
}

// Input to emit — chainHash computed by logger
export type AuditEventInput = Omit<AuditEvent, 'id' | 'timestamp' | 'chainHash'>
