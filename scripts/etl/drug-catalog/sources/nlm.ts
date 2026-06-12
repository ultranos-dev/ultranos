import type { SourceDrugData } from '../types.js'

const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST'

interface RxNavResponse {
  idGroup?: {
    rxnormId?: string[]
  }
}

export async function fetchFromNlm(
  atcCode: string,
  innName: string
): Promise<SourceDrugData> {
  try {
    const url = `${RXNAV_BASE}/rxcui.json?name=${encodeURIComponent(innName)}&allsrc=0`
    const res = await fetch(url)
    if (!res.ok) return { source: 'nlm', atcCode }

    const json = await res.json() as RxNavResponse
    const rxnormCui = json.idGroup?.rxnormId?.[0]

    return { source: 'nlm', atcCode, rxnormCui }
  } catch {
    return { source: 'nlm', atcCode }
  }
}
