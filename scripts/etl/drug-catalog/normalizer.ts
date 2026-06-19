import type { EmlDrugEntry, SourceDrugData, NormalizedDrugRow } from './types.js'

const SOURCE_PRIORITY: Record<SourceDrugData['source'], number> = {
  drugbank: 3,
  openfda: 2,
  nlm: 1,
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  return values.find(v => v !== undefined)
}

function firstNonEmptyArray<T>(...arrays: Array<T[] | undefined>): T[] {
  for (const arr of arrays) {
    if (arr && arr.length > 0) return arr
  }
  return []
}

export function normalizeDrug(
  entry: EmlDrugEntry,
  sources: SourceDrugData[]
): NormalizedDrugRow {
  // Sort descending by priority — drugbank first
  const sorted = [...sources].sort(
    (a, b) => SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source]
  )

  const now = new Date().toISOString()
  const sourceNames = sorted.map(s => s.source).join(',')

  return {
    atc_code: entry.atcCode,
    inn_name: entry.innName,
    rxnorm_cui: firstDefined(...sorted.map(s => s.rxnormCui)),
    drugbank_id: firstDefined(...sorted.map(s => s.drugbankId)),
    brand_names: firstNonEmptyArray(...sorted.map(s => s.brandNames)),
    dose_forms: firstNonEmptyArray(...sorted.map(s => s.doseForms)),
    therapeutic_class: firstDefined(...sorted.map(s => s.therapeuticClass)) ?? '',
    mechanism_of_action: firstDefined(...sorted.map(s => s.mechanismOfAction)),
    indications_clinical: firstNonEmptyArray(...sorted.map(s => s.indicationsClinical)),
    adult_dosing: firstNonEmptyArray(...sorted.map(s => s.adultDosing)) as unknown[],
    pediatric_dosing: firstNonEmptyArray(...sorted.map(s => s.pediatricDosing)) as unknown[],
    renal_adjustment: firstDefined(...sorted.map(s => s.renalAdjustment)),
    adverse_events: firstNonEmptyArray(...sorted.map(s => s.adverseEvents)) as unknown[],
    contraindications: firstNonEmptyArray(...sorted.map(s => s.contraindications)),
    interactions: firstNonEmptyArray(...sorted.map(s => s.interactions)) as unknown[],
    pregnancy_clinical: firstDefined(...sorted.map(s => s.pregnancyClinical)),
    administration_notes: firstDefined(...sorted.map(s => s.administrationNotes)) ?? {},
    pharmacokinetics: firstDefined(...sorted.map(s => s.pharmacokinetics)) ?? {},
    summary_plain: firstDefined(...sorted.map(s => s.summaryPlain)) ?? {},
    used_for: firstNonEmptyArray(...sorted.map(s => s.usedFor)),
    common_side_effects: firstNonEmptyArray(...sorted.map(s => s.commonSideEffects)),
    when_to_seek_help: firstDefined(...sorted.map(s => s.whenToSeekHelp)) ?? {},
    storage_instructions: firstDefined(...sorted.map(s => s.storageInstructions)) ?? {},
    pregnancy_summary_plain: firstDefined(...sorted.map(s => s.pregnancySummaryPlain)) ?? {},
    warnings_summary_plain: firstDefined(...sorted.map(s => s.warningsSummaryPlain)) ?? {},
    substitutes: [],
    recall_alerts: [],
    eml_status: entry.emlStatus,
    etl_source: sourceNames,
    last_etl_refresh: now,
  }
}
