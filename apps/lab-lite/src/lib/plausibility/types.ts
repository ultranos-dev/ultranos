/**
 * Plausibility Checker — Core Types
 * Story 43.5 — Task 1.1
 *
 * Pure offline computation layer. All types used across the plausibility module.
 * No PHI in any of these types — flag messages reference analyte names and rule
 * types but NEVER patient data or actual result values in audit events.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type PlausibilityRuleType = 'ABSOLUTE_RANGE' | 'DELTA_CHECK' | 'INTERNAL_CONSISTENCY'

export type PlausibilitySeverity = 'WARNING' | 'CRITICAL'

// ---------------------------------------------------------------------------
// Core flag type — one instance per triggered rule per analyte
// ---------------------------------------------------------------------------

export interface PlausibilityFlag {
  id: string                        // UUID — stable ID for acknowledgment linking
  ruleType: PlausibilityRuleType
  analyte: string                   // human-readable analyte name (e.g. "WBC")
  loincCode: string                 // canonical key
  severity: PlausibilitySeverity
  message: string                   // "Result flagged: [reason]."
  currentValue?: number             // the value that triggered the flag
  referenceValue?: number           // prior result value (delta checks)
  referenceDate?: string            // ISO — when the prior result was entered
  threshold?: number                // the threshold that was exceeded
  acknowledged: boolean
}

// ---------------------------------------------------------------------------
// Acknowledgment — stored to Dexie flagAcknowledgments table
// ---------------------------------------------------------------------------

export interface FlagAcknowledgment {
  flagId: string           // FK to PlausibilityFlag.id
  resultId: string         // FK to LabResult.id
  acknowledgedBy: string   // opaque practitioner ID — NEVER a name
  acknowledgedAt: string   // ISO timestamp
  explanationLength: number  // char count only — NOT the explanation text (PHI risk)
  hlcTimestamp: string
}

// ---------------------------------------------------------------------------
// ResultEntry — the current result values passed into the orchestrator
// Fields: loincCode identifies the analyte, value is the numeric measurement.
// ---------------------------------------------------------------------------

export interface ResultEntry {
  loincCode: string
  analyteName: string
  value: number
}

// ---------------------------------------------------------------------------
// PlausibilityConfig — lab-specific threshold override stored in Dexie
// ---------------------------------------------------------------------------

export interface PlausibilityConfig {
  loincCode: string         // primary key
  analyteName: string
  maxDeltaPercent?: number
  maxDeltaAbsolute?: number
  timeWindowHours?: number
  updatedAt: string
  updatedBy: string         // opaque practitioner ID
}

// ---------------------------------------------------------------------------
// ResultSnapshot — minimal record for delta checking (no PHI except patientRef)
// patientRef is "Patient/<uuid>" — opaque, not a name.
// ---------------------------------------------------------------------------

export interface ResultSnapshot {
  id: string              // UUID
  patientRef: string      // "Patient/<uuid>"
  loincCode: string
  analyteName: string
  value: number
  enteredAt: string       // ISO timestamp
}
