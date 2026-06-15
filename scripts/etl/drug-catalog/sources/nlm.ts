import type { SourceDrugData } from '../types.js'

const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST'

interface RxNavResponse {
  idGroup?: {
    rxnormId?: string[]
  }
}

/**
 * Fetches RxNorm CUI from NLM RxNav API by drug name.
 * @param atcCode - Passed through for SourceDrugData tracking only; not sent to API
 * @param innName - International Nonproprietary Name to search (URL-encoded before use)
 * @returns SourceDrugData with rxnormCui if found; empty data on any failure (never throws)
 */
export async function fetchFromNlm(
  atcCode: string,
  innName: string
): Promise<SourceDrugData> {
  try {
    const url = `${RXNAV_BASE}/rxcui.json?name=${encodeURIComponent(innName)}&allsrc=0`
    // allsrc=0: restricts to concept names; set allsrc=1 to include all source vocabularies if needed
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    let res: Response
    try {
      res = await fetch(url, { signal: controller.signal })
    } finally {
      clearTimeout(timeoutId)
    }
    if (!res.ok) return { source: 'nlm', atcCode }

    const json = await res.json() as RxNavResponse
    const rxnormCui = json.idGroup?.rxnormId?.[0]

    return { source: 'nlm', atcCode, rxnormCui }
  } catch {
    return { source: 'nlm', atcCode }
  }
}
