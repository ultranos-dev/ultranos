/**
 * RxNav brand-name source.
 *
 * Given a drug's RxNorm CUI, returns the authoritative brand-name (TTY=BN)
 * concepts RxNorm relates to it. This is a real, license-free coverage bump:
 * the brands come from NLM's curated RxNorm graph, not from model guesses, so
 * there is no risk of an invented brand→generic mapping.
 *
 * Coverage skews US/global (RxNorm is a US terminology); for region-specific
 * brands use the regional-registry source instead. Never throws — any failure
 * yields [] so a single drug can't abort a batch run.
 */

const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST'
const TIMEOUT_MS = 8000

interface RelatedResponse {
  relatedGroup?: {
    conceptGroup?: Array<{
      tty?: string
      conceptProperties?: Array<{ name?: string }>
    }>
  }
}

/** Fetch RxNorm brand-name (BN) concepts for a given RxNorm CUI. */
export async function fetchBrandNamesByRxcui(rxcui: string): Promise<string[]> {
  if (!rxcui?.trim()) return []
  try {
    const url = `${RXNAV_BASE}/rxcui/${encodeURIComponent(rxcui)}/related.json?tty=BN`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(url, { signal: controller.signal })
    } finally {
      clearTimeout(timeoutId)
    }
    if (!res.ok) return []
    const json = (await res.json()) as RelatedResponse

    const out: string[] = []
    const seen = new Set<string>()
    for (const group of json.relatedGroup?.conceptGroup ?? []) {
      if (group.tty !== 'BN') continue
      for (const prop of group.conceptProperties ?? []) {
        const name = prop.name?.trim()
        if (!name) continue
        const key = name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(name)
      }
    }
    return out
  } catch {
    return []
  }
}
