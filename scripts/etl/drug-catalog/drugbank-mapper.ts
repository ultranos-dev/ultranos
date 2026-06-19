import type { DrugBankRecord } from './sources/drugbank-xml.js'
import { deriveDdiSeverity } from './transforms/ddi-severity.js'

const SEVERITY_RANK: Record<string, number> = { CONTRAINDICATED: 0, MAJOR: 1, MODERATE: 2, MINOR: 3 }
const MAX_INTERACTIONS = 50

export interface DrugBankCatalogRow {
  atc_code: string
  drugbank_id: string
  rxnorm_cui?: string
  inn_name: string
  brand_names: string[]
  therapeutic_class: string
  dose_forms: string[]
  mechanism_of_action?: string
  indications_clinical: string[]
  pharmacokinetics: Record<string, string>
  interactions: Array<{ drugAtcCode: string; drugName: string; severity: string; mechanism: string }>
  etl_source: string
  last_etl_refresh: string
}

export function isInRoster(d: DrugBankRecord): boolean {
  return d.groups.includes('approved') && d.atcCodes.length > 0
}

export function mapDrugBankToRows(d: DrugBankRecord, atcByDbId: Map<string, string>, now: string): DrugBankCatalogRow[] {
  if (!isInRoster(d)) return []
  const interactions = d.interactions
    .map((i) => {
      const targetAtc = atcByDbId.get(i.targetDrugbankId)
      if (!targetAtc) return null
      return { drugAtcCode: targetAtc, drugName: i.name, severity: deriveDdiSeverity(i.description), mechanism: i.description }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  interactions.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))
  const cappedInteractions = interactions.slice(0, MAX_INTERACTIONS)

  const pk: Record<string, string> = {}
  for (const [k, v] of Object.entries(d.pharmacokinetics)) if (v) pk[k] = v

  return d.atcCodes.map((atc) => ({
    atc_code: atc,
    drugbank_id: d.drugbankId,
    rxnorm_cui: d.rxcui[0],
    inn_name: d.name,
    brand_names: d.internationalBrands,
    therapeutic_class: d.atcClassByCode[atc] ?? '',
    dose_forms: d.doseForms,
    mechanism_of_action: d.mechanismOfAction,
    indications_clinical: d.indication ? [d.indication] : [],
    pharmacokinetics: pk,
    interactions: cappedInteractions,
    etl_source: 'drugbank',
    last_etl_refresh: now,
  }))
}
