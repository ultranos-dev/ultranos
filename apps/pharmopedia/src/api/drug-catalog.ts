/**
 * Drug Catalog API client — tRPC-REST bridge.
 *
 * GET queries encode input as ?input={"json":...}
 * POST mutations send body as {"json":...}
 * Response shape: { result: { data: { json: T } } }
 *
 * All calls go through hubFetch (certificate-pinned, compromise-aware).
 */
import { hubFetch } from '@/lib/hub-fetch'
import type {
  DrugSearchResult,
  DrugEntryTier1,
  DrugEntryTier2,
  DrugEntryTier3,
  PharmacyPrice,
  DrugBrand,
  DrugBrandPresentation,
  DrugBrandWithPresentations,
} from '@ultranos/shared-types'

function getHubApiUrl(): string {
  return process.env.EXPO_PUBLIC_HUB_API_URL ?? 'http://localhost:3004/api/trpc'
}

function makeUrl(path: string, input?: object): string {
  const baseUrl = getHubApiUrl()
  const url = new URL(baseUrl)
  url.pathname = url.pathname.replace(/\/$/, '') + '/' + path
  if (input !== undefined) {
    url.searchParams.set('input', JSON.stringify({ json: input }))
  }
  return url.toString()
}

function authHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function trpcGet<T>(path: string, input: object, token: string): Promise<T> {
  const res = await hubFetch(makeUrl(path, input), {
    method: 'GET',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error(`Hub API error ${res.status} on ${path}`)
  const body = await res.json() as { result: { data: { json: T } } }
  return body.result.data.json
}

async function trpcPost<T>(path: string, input: object, token: string): Promise<T> {
  const res = await hubFetch(makeUrl(path), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ json: input }),
  })
  if (!res.ok) throw new Error(`Hub API error ${res.status} on ${path}`)
  const body = await res.json() as { result: { data: { json: T } } }
  return body.result.data.json
}

/** Search drugs by name/ATC prefix across supported languages. */
export function searchDrugsApi(
  q: string,
  lang: 'en' | 'prs' | 'ps' | 'ar',
  limit: number,
  token: string,
): Promise<DrugSearchResult[]> {
  return trpcGet('drugCatalog.search', { q, lang, limit }, token)
}

/** Retrieve a full drug entry by ATC code. Tier returned depends on caller's role.
 *  lang controls which localised text fields the Hub returns in the response.
 */
export function getDrugByAtcCodeApi(
  atcCode: string,
  lang: 'en' | 'prs' | 'ps' | 'ar',
  token: string,
): Promise<DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3> {
  return trpcGet('drugCatalog.getByAtcCode', { atcCode, lang }, token)
}

/** Paginated sync — returns entries updated since sinceVersion and the latest catalog version. */
export function syncDrugsApi(
  sinceVersion: number,
  limit: number,
  token: string,
): Promise<{ entries: (DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3)[]; latestVersion: number }> {
  return trpcGet('drugCatalog.sync', { sinceVersion, limit }, token)
}

/** Branded medications (brand + presentations) for a generic drug. Online fetch fallback. */
export function getBrandsByAtcApi(
  atcCode: string,
  token: string,
): Promise<DrugBrandWithPresentations[]> {
  return trpcGet('drugCatalog.getBrandsByAtc', { atcCode }, token)
}

/** Paginated sync of branded medications (trade-name level). */
export function syncBrandsApi(
  sinceVersion: number,
  limit: number,
  token: string,
): Promise<{ brands: DrugBrand[]; latestVersion: number }> {
  return trpcGet('drugCatalog.syncBrands', { sinceVersion, limit }, token)
}

/** Paginated sync of brand presentations (product/pack level). */
export function syncBrandPresentationsApi(
  sinceVersion: number,
  limit: number,
  token: string,
): Promise<{ presentations: DrugBrandPresentation[]; latestVersion: number }> {
  return trpcGet('drugCatalog.syncBrandPresentations', { sinceVersion, limit }, token)
}

/** Fetch real-time pharmacy prices for a drug near a geo-coordinate. */
export function getDrugPricesApi(
  atcCode: string,
  lat: number,
  lng: number,
  sort: 'distance' | 'price',
  limit: number,
  token: string,
): Promise<PharmacyPrice[]> {
  return trpcGet('drugCatalog.getPrices', { atcCode, lat, lng, sort, limit }, token)
}

/** Fields that can be enriched on a drug entry (pharmacist/admin roles only). */
export interface EnrichFields {
  localNames?: Record<string, string>
  dispensingNotes?: string
  formularyStatus?: 'on_formulary' | 'off_formulary' | 'restricted'
  unitCost?: number
}

/** Enrich (mutate) a drug entry with locale-specific or formulary data. POST mutation. */
export function enrichDrugApi(
  atcCode: string,
  fields: EnrichFields,
  token: string,
): Promise<DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3> {
  return trpcPost('drugCatalog.enrich', { atcCode, fields }, token)
}
