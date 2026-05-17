import type { SoapSource } from '../enums.js'

/**
 * SOAP Ledger entry with AI versioning fields.
 * Story 24.1: AI Clinical Scribe — SOAP Note Parsing.
 *
 * Extends the base soap_ledger schema (migration 014) with AI-specific
 * columns added in migration 017.
 */
export interface SoapLedgerEntry {
  id: string
  encounterId: string
  practitionerId: string

  // Encrypted PHI — clinical content
  subjective: string | null
  objective: string | null
  assessment: string | null
  plan: string | null

  hlcTimestamp: string
  createdAt: string

  // AI versioning fields (Story 24.1)
  source: SoapSource
  aiModelVersion: string | null
  originalFreeformText: string | null
  aiRawResponse: string | null
  confirmedBy: string | null
  confirmedAt: string | null
}

/**
 * Result from AI SOAP note parsing (Cloud LLM response).
 */
export interface SOAPParseResult {
  subjective: string
  objective: string
  assessment: string
  plan: string
  modelVersion: string
  confidence?: number
}

/**
 * Error result when AI parsing fails.
 */
export interface SOAPParseError {
  error: 'AI_UNAVAILABLE' | 'CONSENT_NOT_GRANTED'
  reason: string
}
