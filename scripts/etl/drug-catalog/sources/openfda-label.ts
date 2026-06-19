export interface OpenFdaLabel {
  pregnancyClinical?: { pregnancy?: string; lactation?: string; legacyCategory?: string }
  contraindications: string[]
}

const BASE = 'https://api.fda.gov/drug/label.json'

export function openFdaUrl(name: string, apiKey?: string): string {
  const search = encodeURIComponent(`openfda.generic_name:"${name}"`)
  return `${BASE}?search=${search}&limit=1${apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : ''}`
}

export function cleanText(s: string | undefined): string | undefined {
  if (s == null) return undefined
  const out = s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
  return out.length ? out : undefined
}

/** Strip a leading SPL section header: a section number ("8.1 ", "4 ") and/or a run of leading ALL-CAPS heading words ("CONTRAINDICATIONS "). Safe: only removes leading digits/all-caps tokens, never mixed-case content. */
export function stripSectionHeader(s: string): string {
  let out = s.replace(/^\s*\d+(?:\.\d+)*\s+/, '')                 // leading "8.1 " / "4 "
  out = out.replace(/^(?:[A-Z]{3,}[\s:,-]+){1,5}/, '')            // leading ALL-CAPS heading words
  return out.trim()
}

function splitContra(text: string | undefined): string[] {
  const clean = cleanText(text)
  if (!clean) return []
  const stripped = stripSectionHeader(clean)
  return stripped.split(/(?<=\.)\s+/).map((s) => s.trim()).filter((s) => s.length > 15).slice(0, 8)
}

interface Result {
  contraindications?: string[]
  pregnancy?: string[]
  nursing_mothers?: string[]
}

export function parseOpenFdaLabel(json: unknown): OpenFdaLabel | null {
  const r = (json as { results?: Result[] })?.results?.[0]
  if (!r) return null
  const pregnancyClean = cleanText(r.pregnancy?.[0])
  const pregnancy = pregnancyClean ? stripSectionHeader(pregnancyClean) : undefined
  const lactationClean = cleanText(r.nursing_mothers?.[0])
  const lactation = lactationClean ? stripSectionHeader(lactationClean) : undefined
  const legacyCategory = (r.pregnancy?.[0] ?? '').match(/Category ([A-DX])/)?.[1]
  const pregnancyClinical = pregnancy || lactation || legacyCategory
    ? { ...(pregnancy ? { pregnancy } : {}), ...(lactation ? { lactation } : {}), ...(legacyCategory ? { legacyCategory } : {}) }
    : undefined
  const contraindications = splitContra(r.contraindications?.[0])
  if (!pregnancyClinical && contraindications.length === 0) return null
  return { pregnancyClinical, contraindications }
}

export async function fetchOpenFdaLabel(name: string, apiKey?: string, fetchImpl: typeof fetch = fetch): Promise<OpenFdaLabel | null> {
  try {
    const res = await fetchImpl(openFdaUrl(name, apiKey))
    if (!res.ok) return null
    return parseOpenFdaLabel(await res.json())
  } catch {
    return null
  }
}
