/**
 * Spill & Decontamination Protocol Data — Story 47.5
 *
 * Static, offline-bundled protocol definitions for each spill type.
 * No network calls required — all data is bundled at build time.
 *
 * Sources:
 *   - WHO Laboratory Biosafety Manual (4th edition)
 *   - CDC BMBL (Biosafety in Microbiological and Biomedical Laboratories) — spill cleanup procedures
 */

import { SpillType, RiskTier } from '@/types/spill-protocol'
import type { SpillProtocol } from '@/types/spill-protocol'

// ---------------------------------------------------------------------------
// Blood/Serum — MODERATE risk
// Bloodborne pathogen exposure risk (HBV, HIV, HCV)
// ---------------------------------------------------------------------------

const BLOOD_SERUM_PROTOCOL: SpillProtocol = {
  spillType: SpillType.BLOOD_SERUM,
  riskTier: RiskTier.MODERATE,
  ppe: [
    { item: 'gloves', required: true },
    { item: 'gown', required: true },
    { item: 'face_shield', required: false, notes: 'Required if splash risk is present' },
  ],
  steps: [
    {
      order: 1,
      instruction: 'Don gloves and gown. Add face shield if splash risk is present.',
      contactTimeMinutes: null,
      agentName: null,
      notes: null,
    },
    {
      order: 2,
      instruction: 'Cover the spill with absorbent paper towels or granular absorbent material. Do not wipe — absorb.',
      contactTimeMinutes: null,
      agentName: null,
      notes: null,
    },
    {
      order: 3,
      instruction: 'Apply 10% bleach solution (1:10 dilution of household bleach) over the absorbent material.',
      contactTimeMinutes: 10,
      agentName: '10% bleach solution (1:10)',
      notes: 'Pour bleach over the absorbent, do not spray',
    },
    {
      order: 4,
      instruction: 'Wait 10 minutes for the bleach to fully decontaminate the area.',
      contactTimeMinutes: 10,
      agentName: null,
      notes: 'Do not rush this step — contact time is critical',
    },
    {
      order: 5,
      instruction: 'Clean from the perimeter of the spill inward to avoid spreading contamination.',
      contactTimeMinutes: null,
      agentName: null,
      notes: null,
    },
    {
      order: 6,
      instruction: 'Place all contaminated materials (gloves, towels, absorbent) into the infectious waste bin.',
      contactTimeMinutes: null,
      agentName: null,
      notes: 'Use tongs or additional gloves to avoid direct contact',
    },
    {
      order: 7,
      instruction: 'Clean the surface with detergent and water to remove residual bleach.',
      contactTimeMinutes: null,
      agentName: 'Detergent and water',
      notes: null,
    },
    {
      order: 8,
      instruction: 'Remove PPE in the correct order: gown first, then gloves last. Wash hands thoroughly for 20 seconds.',
      contactTimeMinutes: null,
      agentName: null,
      notes: 'Wash hands even if gloves were worn',
    },
  ],
  clearanceTimeMinutes: 15,
  disposalMethod: 'Infectious waste bin (biohazard)',
  additionalWarnings: [],
}

// ---------------------------------------------------------------------------
// Urine — LOW risk
// Minimal biohazard; standard precautions apply
// ---------------------------------------------------------------------------

const URINE_PROTOCOL: SpillProtocol = {
  spillType: SpillType.URINE,
  riskTier: RiskTier.LOW,
  ppe: [
    { item: 'gloves', required: true },
  ],
  steps: [
    {
      order: 1,
      instruction: 'Don gloves.',
      contactTimeMinutes: null,
      agentName: null,
      notes: null,
    },
    {
      order: 2,
      instruction: 'Absorb the spill with paper towels. Dispose of towels in biohazard waste.',
      contactTimeMinutes: null,
      agentName: null,
      notes: null,
    },
    {
      order: 3,
      instruction: 'Clean the surface with detergent and water.',
      contactTimeMinutes: null,
      agentName: 'Detergent and water',
      notes: null,
    },
    {
      order: 4,
      instruction: 'Apply disinfectant to the cleaned surface.',
      contactTimeMinutes: 5,
      agentName: 'Standard disinfectant',
      notes: null,
    },
    {
      order: 5,
      instruction: 'Wait 5 minutes for the disinfectant to work.',
      contactTimeMinutes: 5,
      agentName: null,
      notes: null,
    },
    {
      order: 6,
      instruction: 'Wipe the surface clean.',
      contactTimeMinutes: null,
      agentName: null,
      notes: null,
    },
    {
      order: 7,
      instruction: 'Dispose of all cleaning materials in the biohazard waste bin.',
      contactTimeMinutes: null,
      agentName: null,
      notes: null,
    },
    {
      order: 8,
      instruction: 'Remove gloves and wash hands thoroughly for 20 seconds.',
      contactTimeMinutes: null,
      agentName: null,
      notes: null,
    },
  ],
  clearanceTimeMinutes: 10,
  disposalMethod: 'Biohazard waste bin',
  additionalWarnings: [],
}

// ---------------------------------------------------------------------------
// Chemical/Reagent — HIGH risk
// Toxic fumes, chemical burns; do NOT use bleach
// ---------------------------------------------------------------------------

const CHEMICAL_REAGENT_PROTOCOL: SpillProtocol = {
  spillType: SpillType.CHEMICAL_REAGENT,
  riskTier: RiskTier.HIGH,
  ppe: [
    { item: 'gloves', required: true },
    { item: 'gown', required: true },
    { item: 'face_shield', required: true },
    { item: 'respiratory_protection', required: false, notes: 'Required if chemical is volatile or fuming' },
  ],
  steps: [
    {
      order: 1,
      instruction: 'EVACUATE the immediate area if the chemical is volatile, fuming, or produces strong odors. Alert nearby staff.',
      contactTimeMinutes: null,
      agentName: null,
      notes: 'Do not attempt cleanup without appropriate PPE',
    },
    {
      order: 2,
      instruction: 'Don full PPE: gloves, gown, and face shield. Add respiratory protection if the chemical is volatile.',
      contactTimeMinutes: null,
      agentName: null,
      notes: null,
    },
    {
      order: 3,
      instruction: 'Identify the chemical. Check the Safety Data Sheet (SDS) if available for specific cleanup instructions.',
      contactTimeMinutes: null,
      agentName: null,
      notes: 'SDS is located in the lab safety binder',
    },
    {
      order: 4,
      instruction: 'Use the appropriate neutralizing agent or dry absorbent material specified in the SDS. Do NOT use bleach.',
      contactTimeMinutes: null,
      agentName: 'Per SDS — check label',
      notes: null,
    },
    {
      order: 5,
      instruction: 'Wait for the contact time specified in the SDS before cleanup.',
      contactTimeMinutes: null,
      agentName: null,
      notes: 'Contact time varies by chemical — check SDS',
    },
    {
      order: 6,
      instruction: 'Clean from the perimeter of the spill inward to avoid spreading contamination.',
      contactTimeMinutes: null,
      agentName: null,
      notes: null,
    },
    {
      order: 7,
      instruction: 'Dispose of ALL contaminated materials as chemical waste. Do NOT put chemical waste in the infectious waste bin.',
      contactTimeMinutes: null,
      agentName: null,
      notes: 'Use the chemical waste container — never infectious waste',
    },
    {
      order: 8,
      instruction: 'Ventilate the area by opening windows or activating the exhaust fan.',
      contactTimeMinutes: null,
      agentName: null,
      notes: null,
    },
    {
      order: 9,
      instruction: 'Remove PPE in correct order and wash hands thoroughly for 20 seconds.',
      contactTimeMinutes: null,
      agentName: null,
      notes: null,
    },
  ],
  clearanceTimeMinutes: 30,
  disposalMethod: 'Chemical waste container (NOT infectious waste)',
  additionalWarnings: [
    'DO NOT use bleach on chemical spills — it may create toxic gas.',
    'Check the SDS for the specific chemical before starting cleanup.',
  ],
}

// ---------------------------------------------------------------------------
// Culture/Microbiology — CRITICAL risk
// Infectious aerosol generation — most aggressive protocol
// ---------------------------------------------------------------------------

const CULTURE_MICROBIOLOGY_PROTOCOL: SpillProtocol = {
  spillType: SpillType.CULTURE_MICROBIOLOGY,
  riskTier: RiskTier.CRITICAL,
  ppe: [
    { item: 'double_gloves', required: true },
    { item: 'gown', required: true },
    { item: 'n95_mask', required: true },
    { item: 'face_shield', required: true },
  ],
  steps: [
    {
      order: 1,
      instruction: 'EVACUATE the area immediately. Do NOT touch the spill. Alert all nearby staff to leave.',
      contactTimeMinutes: null,
      agentName: null,
      notes: 'Do not attempt cleanup until aerosol has settled',
    },
    {
      order: 2,
      instruction: 'Close all doors and windows to contain potential aerosol. Turn off HVAC if possible.',
      contactTimeMinutes: null,
      agentName: null,
      notes: 'Aerosol containment is critical',
    },
    {
      order: 3,
      instruction: 'Wait 30 minutes for aerosol particles to settle before anyone re-enters.',
      contactTimeMinutes: 30,
      agentName: null,
      notes: 'This wait is mandatory — do not skip for any reason',
    },
    {
      order: 4,
      instruction: 'Don full PPE: double gloves, gown, N95 mask, and face shield before re-entering.',
      contactTimeMinutes: null,
      agentName: null,
      notes: 'N95 mask is mandatory — surgical mask is NOT sufficient',
    },
    {
      order: 5,
      instruction: 'Cover the spill completely with paper towels. Do not spread the material.',
      contactTimeMinutes: null,
      agentName: null,
      notes: null,
    },
    {
      order: 6,
      instruction: 'Apply concentrated disinfectant (undiluted bleach or appropriate sporicide) over the covered spill.',
      contactTimeMinutes: 30,
      agentName: 'Undiluted bleach or sporicide',
      notes: 'Use concentrated — not diluted — disinfectant for culture spills',
    },
    {
      order: 7,
      instruction: 'Wait 30 minutes for full disinfection contact time.',
      contactTimeMinutes: 30,
      agentName: null,
      notes: 'Do not rush — 30 minutes is the minimum effective contact time',
    },
    {
      order: 8,
      instruction: 'Clean from the perimeter of the spill inward to avoid spreading contamination.',
      contactTimeMinutes: null,
      agentName: null,
      notes: null,
    },
    {
      order: 9,
      instruction: 'Place ALL contaminated materials into an autoclave bag. Seal the bag securely.',
      contactTimeMinutes: null,
      agentName: null,
      notes: 'Everything that touched the spill goes into the autoclave bag',
    },
    {
      order: 10,
      instruction: 'Autoclave the sealed bag before final disposal.',
      contactTimeMinutes: null,
      agentName: null,
      notes: 'Autoclave at 121°C for 30 minutes at 15 psi',
    },
    {
      order: 11,
      instruction: 'Remove PPE in the correct order: face shield first, then gown, then outer gloves, then inner gloves last.',
      contactTimeMinutes: null,
      agentName: null,
      notes: 'Gloves must come off last — they are your final barrier',
    },
    {
      order: 12,
      instruction: 'Wash hands thoroughly with soap and water for at least 20 seconds.',
      contactTimeMinutes: null,
      agentName: null,
      notes: null,
    },
  ],
  clearanceTimeMinutes: 60,
  disposalMethod: 'Autoclave bag → autoclave at 121°C for 30 min → then biohazard waste',
  additionalWarnings: [
    'Microbiology spills may generate infectious aerosols. Wait 30 minutes before approaching.',
    'N95 mask is mandatory — a surgical mask is NOT sufficient protection.',
    'Close doors and windows immediately to contain aerosol spread.',
  ],
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const PROTOCOLS: Record<SpillType, SpillProtocol> = {
  [SpillType.BLOOD_SERUM]: BLOOD_SERUM_PROTOCOL,
  [SpillType.URINE]: URINE_PROTOCOL,
  [SpillType.CHEMICAL_REAGENT]: CHEMICAL_REAGENT_PROTOCOL,
  [SpillType.CULTURE_MICROBIOLOGY]: CULTURE_MICROBIOLOGY_PROTOCOL,
}

/**
 * Returns the full decontamination protocol for a given spill type.
 * All data is statically bundled — no network call required (offline-safe).
 */
export function getSpillProtocol(spillType: SpillType): SpillProtocol {
  return PROTOCOLS[spillType]
}

/**
 * Returns all four protocols, ordered from lowest to highest risk tier.
 */
export function getAllSpillProtocols(): SpillProtocol[] {
  return [
    PROTOCOLS[SpillType.URINE],
    PROTOCOLS[SpillType.BLOOD_SERUM],
    PROTOCOLS[SpillType.CHEMICAL_REAGENT],
    PROTOCOLS[SpillType.CULTURE_MICROBIOLOGY],
  ]
}
