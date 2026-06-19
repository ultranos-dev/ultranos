export interface MedlinePlusProse { summary: string; uses: string[]; url?: string }

const RXNORM_OID = '2.16.840.1.113883.6.88'

export function medlinePlusUrl(rxcui: string): string {
  return `https://connect.medlineplus.gov/service?mainSearchCriteria.v.cs=${RXNORM_OID}` +
    `&mainSearchCriteria.v.c=${encodeURIComponent(rxcui)}&knowledgeResponseType=application/json`
}

export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim()
}

export function extractUses(html: string): string[] {
  const out: string[] = []
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) { const t = stripHtml(m[1]); if (t) out.push(t) }
  return out
}

export function parseMedlinePlus(json: unknown): MedlinePlusProse | null {
  const feed = (json as { feed?: { entry?: unknown } })?.feed
  if (!feed || feed.entry == null) return null
  const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry]
  const e0 = entries[0] as { summary?: { _value?: string }; link?: Array<{ href?: string }> } | undefined
  if (!e0) return null
  const html = e0.summary?._value ?? ''
  const summary = stripHtml(html)
  if (!summary) return null
  return { summary, uses: extractUses(html), url: e0.link?.[0]?.href }
}

export async function fetchMedlinePlusProse(rxcui: string, fetchImpl: typeof fetch = fetch): Promise<MedlinePlusProse | null> {
  try {
    const res = await fetchImpl(medlinePlusUrl(rxcui))
    if (!res.ok) return null
    return parseMedlinePlus(await res.json())
  } catch {
    return null
  }
}
