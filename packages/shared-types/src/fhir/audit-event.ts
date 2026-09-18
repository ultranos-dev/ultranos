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
  orgId?: string           // Tenant org UUID — satisfies audit_log.org_id NOT NULL. Not part of the hash chain.
  metadata?: Record<string, unknown> // non-PHI context only
}

// Input to emit — chainHash computed by logger.
//
// The enum-typed fields are widened to their string-literal-union form
// (`${AuditAction}` → 'READ' | 'CREATE' | …). Because these are *string* enums,
// this accepts BOTH the bare value (`action: 'CREATE'`) and the enum member
// reference (`action: AuditAction.CREATE`) at call sites, while still rejecting
// typos/invalid values (e.g. 'CRATE' is not in the union). The canonical stored
// `AuditEvent` keeps the strict enum types; only the emit-input surface is widened
// so the hundreds of call sites that pass valid string literals type-check without
// forcing an enum import at every site.
export type AuditEventInput = Omit<
  AuditEvent,
  'id' | 'timestamp' | 'chainHash' | 'actorRole' | 'action' | 'resourceType' | 'outcome'
> & {
  actorRole: `${UserRole}`
  action: `${AuditAction}`
  resourceType: `${AuditResourceType}`
  outcome: `${AuditOutcome}`
}
