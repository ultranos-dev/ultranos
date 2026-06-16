/**
 * ETL internal types — drug catalog seed pipeline (Plan 2).
 *
 * SourceDrugData: per-source partial data for a single drug.
 * NormalizedDrugRow: merged, DB-ready row for drug_catalog upsert.
 *
 * IMPORTANT: NormalizedDrugRow intentionally omits local enrichment fields
 * (local_names, dispensing_notes, formulary_status, unit_cost) — the ETL
 * must never overwrite curator-supplied data.
 */

export interface EmlDrugEntry {
  atcCode: string
  innName: string
  /** US-equivalent names for API lookups (e.g., paracetamol → acetaminophen) */
  aliases?: string[]
  /** EML status from Afghanistan National Licensed Medicine List */
  emlStatus?: 'eml' | 'lml'
}

export interface SourceDrugData {
  source: 'nlm' | 'openfda' | 'drugbank'
  atcCode: string
  rxnormCui?: string
  drugbankId?: string
  brandNames?: string[]
  doseForms?: string[]
  therapeuticClass?: string
  mechanismOfAction?: string
  indicationsClinical?: string[]
  adultDosing?: Array<{
    indication: string
    adultDose?: string
    frequency: string
    duration?: string
    route?: string
  }>
  pediatricDosing?: Array<{
    indication: string
    pediatricDose?: string
    frequency: string
    duration?: string
    route?: string
    weightBased?: boolean
  }>
  renalAdjustment?: string
  adverseEvents?: Array<{ effect: string; frequency?: string; severity?: string }>
  contraindications?: string[]
  interactions?: Array<{
    drugAtcCode: string
    drugName: string
    severity: 'CONTRAINDICATED' | 'MAJOR' | 'MODERATE' | 'MINOR'
    mechanism: string
  }>
  pregnancyCategory?: string
  administrationNotes?: Record<string, string>
  pharmacokinetics?: {
    halfLife?: string
    peakEffect?: string
    bioavailability?: string
    proteinBinding?: string
  }
  summaryPlain?: Record<string, string>
  usedFor?: Record<string, string>[]
  commonSideEffects?: Record<string, string>[]
  whenToSeekHelp?: Record<string, string>
  storageInstructions?: Record<string, string>
  pregnancySummaryPlain?: Record<string, string>
  warningsSummaryPlain?: Record<string, string>
}

/**
 * Maps directly to drug_catalog table columns (snake_case).
 * Only ETL-owned fields — never local enrichment fields.
 */
export interface NormalizedDrugRow {
  atc_code: string
  inn_name: string
  rxnorm_cui?: string
  drugbank_id?: string
  brand_names: string[]
  dose_forms: string[]
  therapeutic_class: string
  mechanism_of_action?: string
  indications_clinical: string[]
  adult_dosing: unknown[]
  pediatric_dosing: unknown[]
  renal_adjustment?: string
  adverse_events: unknown[]
  contraindications: string[]
  interactions: unknown[]
  pregnancy_category?: string
  administration_notes: Record<string, string>
  /** JSONB column — stored as-is; typed narrowly in SourceDrugData but widened here for DB storage */
  pharmacokinetics: Record<string, unknown>
  summary_plain: Record<string, string>
  used_for: Record<string, string>[]
  common_side_effects: Record<string, string>[]
  when_to_seek_help: Record<string, string>
  storage_instructions: Record<string, string>
  pregnancy_summary_plain: Record<string, string>
  warnings_summary_plain: Record<string, string>
  substitutes: string[]
  recall_alerts: unknown[]
  eml_status?: 'eml' | 'lml'
  etl_source: string
  last_etl_refresh: string
}
