// packages/shared-types/src/fhir/drug-catalog.ts

export interface DrugLocalizedText {
  en?: string
  ar?: string   // Arabic
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
  halfLife?: string              // free-text, e.g. "approximately 10 minutes"
  proteinBinding?: string        // e.g. "approximately 3%"
  volumeOfDistribution?: string
  clearance?: string
  metabolism?: string
  excretion?: string             // sourced from DrugBank route-of-elimination
}

/** Structured clinical pregnancy/lactation info, aligned to the FDA PLLR label rule. */
export interface DrugPregnancyClinical {
  pregnancy?: string             // PLLR 8.1 — Pregnancy
  lactation?: string             // PLLR 8.2 — Lactation
  reproductivePotential?: string // PLLR 8.3 — Females & males of reproductive potential
  legacyCategory?: string        // legacy A/B/C/D/X letter, when a source still carries one
}

export interface RecallAlert {
  recallId: string
  description: string
  initiationDate: string
  status: string
}

/** A representative product image for a drug entry. URLs only — never blobs in the synced catalog. */
export interface DrugImage {
  url: string
  brand?: string         // brand depicted; undefined = generic/representative
  caption?: string
  isPrimary?: boolean     // shown as the header "profile" image
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
  images?: DrugImage[]
  summaryPlain: DrugLocalizedText
  usedFor: DrugLocalizedText[]
  commonSideEffects: DrugLocalizedText[]
  whenToSeekHelp: DrugLocalizedText
  storageInstructions: DrugLocalizedText
  pregnancySummaryPlain: DrugLocalizedText
  warningsSummaryPlain: DrugLocalizedText
  /** Per-field, per-lang machine|confirmed status for displayed translations. Field keys are entity field names (e.g. "summaryPlain"). */
  translationStatus?: Record<string, Record<string, string>>
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
  pregnancyClinical?: DrugPregnancyClinical
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

// ── Branded medications ─────────────────────────────────────────────────────────
// A trade-name product (DrugBrand) linked to a generic drug_catalog entry by ATC,
// fanning out into specific marketed products/packs (DrugBrandPresentation).
// FHIR R4 Medication-aligned: brand≈Medication.code, manufacturer≈Medication.manufacturer,
// presentation form/amount≈Medication.form/amount. Reference data — never PHI.

/** A branded/trade-name medication linked to a generic catalog entry (by ATC code). */
export interface DrugBrand {
  id: string
  genericAtcCode: string             // FK → DrugEntryTier1.atcCode
  brandName: string
  manufacturer?: string              // marketing-authorization holder; undefined = unknown
  brandNameLocal: DrugLocalNames
  rxStatus: 'rx' | 'otc' | 'unknown'
  version: number
  lastUpdated: string
}

/** A specific marketed product/pack of a brand (strength + form + pack + price). */
export interface DrugBrandPresentation {
  id: string
  brandId: string                    // FK → DrugBrand.id
  strength?: string                  // "625 mg"
  doseForm?: string                  // tablet / suspension
  route?: string
  packSize?: number                  // 14
  packUnit?: string                  // tablets
  volume?: string                    // "100 mL"
  gtin?: string                      // barcode
  registrationNumber?: string
  registrationStatus: 'marketed' | 'withdrawn' | 'unknown'
  market?: string                    // country/market of registration
  /** Indicative list price — NOT the per-pharmacy real-time price (see PharmacyPrice). */
  referencePrice?: number
  currency?: string
  packagingPhotoUrl?: string
  version: number
  lastUpdated: string
}

/** A brand with its presentations — returned by getBrandsByAtc, rendered on drug-detail. */
export interface DrugBrandWithPresentations extends DrugBrand {
  presentations: DrugBrandPresentation[]
}

/** Lightweight brand search hit — shown as a "brand" result row alongside generics. */
export interface BrandSearchResult {
  id: string
  brandName: string
  manufacturer?: string
  genericAtcCode: string
  genericInnName: string      // the generic this brand resolves to
  doseForm?: string           // representative form (for the result subtitle)
  referencePrice?: number     // lowest presentation price, if any
  currency?: string
}

/** A sibling brand of the same generic (for the substitution loop on brand-detail). */
export interface DrugBrandSibling {
  id: string
  brandName: string
  manufacturer?: string
}

/** Brand-detail payload: the brand, its presentations, the generic it maps to, and sibling brands. */
export interface DrugBrandDetail {
  id: string
  brandName: string
  manufacturer?: string
  rxStatus: 'rx' | 'otc' | 'unknown'
  genericAtcCode: string
  genericInnName: string
  presentations: DrugBrandPresentation[]
  siblings: DrugBrandSibling[]
}
