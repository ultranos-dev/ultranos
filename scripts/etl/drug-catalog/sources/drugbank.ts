import type { SourceDrugData } from '../types.js'

/**
 * DrugBank adapter — Phase 1 stub.
 *
 * DrugBank requires a commercial license for API access.
 * Returns empty data until Phase 2 implementation with DRUGBANK_API_KEY.
 *
 * Phase 2 implementation: fetch from https://api.drugbank.com/v1/drugs/<id>
 * using the ATC code or drug name to retrieve the DrugBank drug ID, then
 * fetch full clinical data (interactions, dosing, pharmacokinetics).
 */
export async function fetchFromDrugBank(
  atcCode: string,
  _innName: string
): Promise<SourceDrugData> {
  return { source: 'drugbank', atcCode }
}
