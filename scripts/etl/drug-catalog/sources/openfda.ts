import type { SourceDrugData } from '../types.js'

const OPENFDA_BASE = 'https://api.fda.gov/drug/label.json'

interface OpenFdaResult {
  openfda?: {
    brand_name?: string[]
    pharm_class_epc?: string[]
  }
  indications_and_usage?: string[]
  contraindications?: string[]
  adverse_reactions?: string[]
  pregnancy?: string[]
  mechanism_of_action?: string[]
}

interface OpenFdaResponse {
  results?: OpenFdaResult[]
}

function parseSentences(text: string, max: number): string[] {
  return text
    .split(/[.,;]/)
    .map(s => s.trim())
    .filter(s => s.length > 3)
    .slice(0, max)
}

/**
 * Fetches drug label data from OpenFDA by generic name.
 * @param atcCode - Passed through for SourceDrugData tracking only; not sent to API
 * @param innName - International Nonproprietary Name to search
 * @returns SourceDrugData with parsed label data if found; empty data on any failure (never throws)
 */
export async function fetchFromOpenFda(
  atcCode: string,
  innName: string
): Promise<SourceDrugData> {
  try {
    const search = `openfda.generic_name:"${encodeURIComponent(innName)}"`
    const url = `${OPENFDA_BASE}?search=${search}&limit=1`
    const res = await fetch(url)
    if (!res.ok) return { source: 'openfda', atcCode }

    const json = await res.json() as OpenFdaResponse
    const r = json.results?.[0]
    if (!r) return { source: 'openfda', atcCode }

    const brandNames = [...new Set(
      (r.openfda?.brand_name ?? []).map(n => n.split(' ')[0]).filter(Boolean)
    )]

    const therapeuticClass = (r.openfda?.pharm_class_epc?.[0] ?? '')
      .replace(/ \[EPC\]$/, '')

    const adverseEvents = parseSentences(r.adverse_reactions?.[0] ?? '', 10)
      .map(effect => ({ effect }))

    const contraindications = parseSentences(r.contraindications?.[0] ?? '', 5)

    const pregnancyCategoryMatch = (r.pregnancy?.[0] ?? '').match(/Category ([A-DX])/)
    const pregnancyCategory = pregnancyCategoryMatch?.[1]

    const mechanismOfAction = r.mechanism_of_action?.[0]

    return {
      source: 'openfda',
      atcCode,
      brandNames: brandNames.length > 0 ? brandNames : undefined,
      therapeuticClass: therapeuticClass || undefined,
      adverseEvents: adverseEvents.length > 0 ? adverseEvents : undefined,
      contraindications: contraindications.length > 0 ? contraindications : undefined,
      pregnancyCategory,
      mechanismOfAction,
    }
  } catch {
    return { source: 'openfda', atcCode }
  }
}
