// packages/shared-types/src/fhir/drug-catalog.ts

export interface DrugLocalizedText {
  en?: string
  prs?: string  // Dari Persian
  ps?: string   // Pashto
}

export interface DrugLocalNames {
  prs?: string
  ps?: string
}

export interface DrugDosing {
  indication: string
  adultDose?: string
  pediatricDose?: string  // weight-based e.g. "40mg/kg/day"
  frequency: string
  duration?: string
  route?: string
}

export interface DrugInteraction {
  drugAtcCode: string
  drugName: string
  severity: 'CONTRAINDICATED' | 'MAJOR' | 'MODERATE' | 'MINOR'
  mechanism: string
}

export interface AdverseEvent {
  effect: string
  frequency: 'common' | 'uncommon' | 'rare' | 'unknown'
  severity: 'mild' | 'moderate' | 'severe'
}

export interface DrugPharmacokinetics {
  halfLifeHours?: number
  proteinBindingPct?: number
  volumeOfDistribution?: string
  metabolism?: string
  excretion?: string
}

export interface RecallAlert {
  recallId: string
  description: string
  initiationDate: string
  status: string
}

/** Tier 1 — all authenticated users */
export interface DrugEntryTier1 {
  atcCode: string
  rxnormCui?: string
  innName: string
  brandNames: string[]
  doseForms: string[]
  therapeuticClass: string
  localNames: DrugLocalNames
  summaryPlain: DrugLocalizedText
  usedFor: DrugLocalizedText[]
  commonSideEffects: DrugLocalizedText[]
  whenToSeekHelp: DrugLocalizedText
  storageInstructions: DrugLocalizedText
  pregnancySummaryPlain: DrugLocalizedText
  warningsSummaryPlain: DrugLocalizedText
  version: number
  lastUpdated: string
}

/** Tier 2 — clinical roles (DOCTOR, NURSE, LAB_TECH) */
export interface DrugEntryTier2 extends DrugEntryTier1 {
  mechanismOfAction?: string
  indicationsClinical: string[]
  adultDosing: DrugDosing[]
  pediatricDosing: DrugDosing[]
  renalAdjustment?: string
  adverseEvents: AdverseEvent[]
  contraindications: string[]
  interactions: DrugInteraction[]
  pregnancyCategory?: string
  administrationNotes: DrugLocalizedText
  pharmacokinetics: DrugPharmacokinetics
}

/** Tier 3 — pharmacist role only */
export interface DrugEntryTier3 extends DrugEntryTier2 {
  formularyStatus?: 'on_formulary' | 'off_formulary' | 'restricted'
  dispensingNotes?: string
  substitutes: string[]  // ATC codes of therapeutic equivalents
  recallAlerts: RecallAlert[]
  unitCost?: number
}

/** Lightweight search result — no tier content */
export interface DrugSearchResult {
  atcCode: string
  innName: string
  brandNames: string[]
  therapeuticClass: string
  doseForms: string[]
  localName?: string  // matched local name for the requested lang
}

/** Real-time pharmacy price entry (not cached offline) */
export interface PharmacyPrice {
  facilityId: string
  pharmacyName: string
  distanceKm: number
  retailPrice: number
  stockSignal: 'in_stock' | 'low_stock' | 'out_of_stock'
  doseForm?: string
  quantity?: number
}

export interface PharmacyFacility {
  id: string
  name: string
  latitude: number
  longitude: number
  address?: string
}
