import type {
  DrugEntryTier1,
  DrugEntryTier2,
  DrugEntryTier3,
  DrugLocalNames,
  DrugLocalizedText,
  DrugDosing,
  AdverseEvent,
  DrugInteraction,
  DrugPharmacokinetics,
  DrugPregnancyClinical,
  RecallAlert,
} from '@ultranos/shared-types'

export type UserRole = string

const PHARMACIST_ROLES = new Set(['PHARMACIST', 'ADMIN'])
const CLINICAL_ROLES = new Set(['DOCTOR', 'NURSE', 'LAB_TECH'])

export function getTierForRole(role: UserRole): 'public' | 'clinical' | 'pharmacist' {
  if (PHARMACIST_ROLES.has(role)) return 'pharmacist'
  if (CLINICAL_ROLES.has(role)) return 'clinical'
  return 'public'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawRow = Record<string, any>

export function scopeEntryToTier(
  row: RawRow,
  role: UserRole
): DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3 {
  const tier = getTierForRole(role)

  const tier1: DrugEntryTier1 = {
    atcCode: row.atc_code as string,
    rxnormCui: row.rxnorm_cui as string | undefined,
    innName: row.inn_name as string,
    brandNames: (row.brand_names ?? []) as string[],
    doseForms: (row.dose_forms ?? []) as string[],
    therapeuticClass: (row.therapeutic_class ?? '') as string,
    localNames: (row.local_names ?? {}) as DrugLocalNames,
    translationStatus: (row.translation_status ?? {}) as Record<string, Record<string, string>>,
    summaryPlain: (row.summary_plain ?? {}) as DrugLocalizedText,
    usedFor: (row.used_for ?? []) as DrugLocalizedText[],
    commonSideEffects: (row.common_side_effects ?? []) as DrugLocalizedText[],
    whenToSeekHelp: (row.when_to_seek_help ?? {}) as DrugLocalizedText,
    storageInstructions: (row.storage_instructions ?? {}) as DrugLocalizedText,
    pregnancySummaryPlain: (row.pregnancy_summary_plain ?? {}) as DrugLocalizedText,
    warningsSummaryPlain: (row.warnings_summary_plain ?? {}) as DrugLocalizedText,
    version: row.version as number,
    lastUpdated: row.last_updated as string,
  }

  if (tier === 'public') return tier1

  const tier2: DrugEntryTier2 = {
    ...tier1,
    mechanismOfAction: row.mechanism_of_action as string | undefined,
    indicationsClinical: (row.indications_clinical ?? []) as string[],
    adultDosing: (row.adult_dosing ?? []) as DrugDosing[],
    pediatricDosing: (row.pediatric_dosing ?? []) as DrugDosing[],
    renalAdjustment: row.renal_adjustment as string | undefined,
    adverseEvents: (row.adverse_events ?? []) as AdverseEvent[],
    contraindications: (row.contraindications ?? []) as string[],
    interactions: (row.interactions ?? []) as DrugInteraction[],
    pregnancyClinical: (row.pregnancy_clinical ?? undefined) as DrugPregnancyClinical | undefined,
    administrationNotes: (row.administration_notes ?? {}) as DrugLocalizedText,
    pharmacokinetics: (row.pharmacokinetics ?? {}) as DrugPharmacokinetics,
  }

  if (tier === 'clinical') return tier2

  const tier3: DrugEntryTier3 = {
    ...tier2,
    formularyStatus: row.formulary_status as 'on_formulary' | 'off_formulary' | 'restricted' | undefined,
    dispensingNotes: row.dispensing_notes as string | undefined,
    substitutes: (row.substitutes ?? []) as string[],
    recallAlerts: (row.recall_alerts ?? []) as RecallAlert[],
    unitCost: row.unit_cost as number | undefined,
  }

  return tier3
}

/** ETL-sourced fields that must never be overwritten by the /enrich endpoint */
export const ETL_PROTECTED_FIELDS = new Set([
  'inn_name', 'brand_names', 'dose_forms', 'therapeutic_class',
  'rxnorm_cui', 'drugbank_id', 'mechanism_of_action', 'indications_clinical',
  'adult_dosing', 'pediatric_dosing', 'renal_adjustment', 'adverse_events',
  'contraindications', 'interactions', 'pregnancy_clinical', 'administration_notes',
  'pharmacokinetics', 'summary_plain', 'used_for', 'common_side_effects',
  'when_to_seek_help', 'storage_instructions', 'pregnancy_summary_plain',
  'warnings_summary_plain', 'substitutes', 'recall_alerts', 'translation_status',
])

/** Enrichment fields each role is permitted to write */
export const ENRICHMENT_FIELDS_BY_ROLE: Record<'clinical' | 'pharmacist', Set<string>> = {
  clinical: new Set(['local_names']),
  pharmacist: new Set(['local_names', 'dispensing_notes', 'formulary_status', 'unit_cost']),
}
