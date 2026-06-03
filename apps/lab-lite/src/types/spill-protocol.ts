/**
 * Spill & Decontamination Protocol Types — Story 47.5
 *
 * Pure type definitions — no runtime dependencies.
 * No PHI: spill incidents reference techId (opaque practitioner ID) only.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum SpillType {
  BLOOD_SERUM = 'BLOOD_SERUM',
  URINE = 'URINE',
  CHEMICAL_REAGENT = 'CHEMICAL_REAGENT',
  CULTURE_MICROBIOLOGY = 'CULTURE_MICROBIOLOGY',
}

export enum RiskTier {
  LOW = 'LOW',           // Urine
  MODERATE = 'MODERATE', // Blood/Serum
  HIGH = 'HIGH',         // Chemical/Reagent
  CRITICAL = 'CRITICAL', // Culture/Microbiology
}

// ---------------------------------------------------------------------------
// Protocol sub-types
// ---------------------------------------------------------------------------

export interface PpeRequirement {
  item: string
  required: boolean
  notes?: string
}

export interface DecontaminationStep {
  order: number
  instruction: string
  /** Minutes to wait (contact time). null means no mandatory wait. */
  contactTimeMinutes: number | null
  /** Decontamination agent to use, if applicable. */
  agentName: string | null
  notes: string | null
}

// ---------------------------------------------------------------------------
// Full protocol
// ---------------------------------------------------------------------------

export interface SpillProtocol {
  spillType: SpillType
  riskTier: RiskTier
  ppe: PpeRequirement[]
  steps: DecontaminationStep[]
  /** Minutes before area can be re-entered. */
  clearanceTimeMinutes: number
  disposalMethod: string
  additionalWarnings: string[]
}

// ---------------------------------------------------------------------------
// Incident record (persisted to Dexie, queued for Hub sync)
// ---------------------------------------------------------------------------

export interface SpillIncident {
  id: string
  spillType: SpillType
  riskTier: RiskTier
  occurredAt: string           // ISO 8601
  location: string
  stepsCompleted: number[]     // step order numbers confirmed by tech
  completedAt: string | null   // null while in progress
  techId: string               // opaque practitioner ID — never a name
  notes: string
  hlcTimestamp: string
  syncStatus: 'pending' | 'synced' | 'failed'
}
