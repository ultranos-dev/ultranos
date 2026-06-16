import type { SourceDrugData } from '../types.js'

const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST'

interface RxNavResponse {
  idGroup?: {
    rxnormId?: string[]
  }
}

async function fetchRxCuiByName(atcCode: string, name: string): Promise<string | undefined> {
  try {
    const url = `${RXNAV_BASE}/rxcui.json?name=${encodeURIComponent(name)}&allsrc=0`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    let res: Response
    try {
      res = await fetch(url, { signal: controller.signal })
    } finally {
      clearTimeout(timeoutId)
    }
    if (!res.ok) return undefined
    const json = await res.json() as RxNavResponse
    return json.idGroup?.rxnormId?.[0]
  } catch {
    return undefined
  }
}

/**
 * Fetches RxNorm CUI from NLM RxNav API by drug name.
 * Tries the INN name first, then falls back to aliases if provided.
 * @param atcCode - Passed through for SourceDrugData tracking only; not sent to API
 * @param innName - International Nonproprietary Name to search (URL-encoded before use)
 * @param aliases - Optional US-equivalent names to try if INN returns no CUI
 * @returns SourceDrugData with rxnormCui if found; empty data on any failure (never throws)
 */
export async function fetchFromNlm(
  atcCode: string,
  innName: string,
  aliases?: string[]
): Promise<SourceDrugData> {
  // Try INN name first
  const cui = await fetchRxCuiByName(atcCode, innName)
  if (cui) return { source: 'nlm', atcCode, rxnormCui: cui }

  // Try aliases in order
  if (aliases) {
    for (const alias of aliases) {
      const aliasCui = await fetchRxCuiByName(atcCode, alias)
      if (aliasCui) return { source: 'nlm', atcCode, rxnormCui: aliasCui }
    }
  }

  return { source: 'nlm', atcCode }
}
