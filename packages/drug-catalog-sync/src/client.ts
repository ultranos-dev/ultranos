import type {
  DrugEntryTier1,
  DrugEntryTier2,
  DrugEntryTier3,
  DrugBrand,
  DrugBrandPresentation,
} from '@ultranos/shared-types'

export type DrugEntry = DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3

export interface DrugSyncPage {
  entries: DrugEntry[]
  latestVersion: number
}
export interface BrandSyncPage {
  brands: DrugBrand[]
  latestVersion: number
}
export interface PresentationSyncPage {
  presentations: DrugBrandPresentation[]
  latestVersion: number
}

export interface CatalogClient {
  syncDrugs(sinceVersion: number, limit: number): Promise<DrugSyncPage>
  syncBrands(sinceVersion: number, limit: number): Promise<BrandSyncPage>
  syncBrandPresentations(sinceVersion: number, limit: number): Promise<PresentationSyncPage>
}

export interface CatalogClientConfig {
  /** tRPC base, e.g. http://localhost:3004/api/trpc */
  baseUrl: string
  /** App-injected auth — Supabase session (OPD) or auth-session-store (Pharmacy). */
  getToken: () => Promise<string | null>
  /** Injectable fetch — standard `fetch` in web apps, a pinned fetch elsewhere; overridable in tests. */
  fetchImpl?: typeof fetch
}

function buildUrl(baseUrl: string, path: string, input: object): string {
  const url = new URL(baseUrl)
  url.pathname = url.pathname.replace(/\/$/, '') + '/' + path
  url.searchParams.set('input', JSON.stringify({ json: input }))
  return url.toString()
}

export function createCatalogClient(config: CatalogClientConfig): CatalogClient {
  const doFetch = config.fetchImpl ?? fetch

  async function get<T>(path: string, input: object): Promise<T> {
    const token = await config.getToken()
    if (!token) throw new Error('drug-catalog-sync: authentication required')
    const res = await doFetch(buildUrl(config.baseUrl, path, input), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`drug-catalog-sync: ${path} failed: ${res.status}`)
    const body = (await res.json()) as { result: { data: { json: T } } }
    return body.result.data.json
  }

  return {
    syncDrugs: (sinceVersion, limit) =>
      get<DrugSyncPage>('drugCatalog.sync', { sinceVersion, limit }),
    syncBrands: (sinceVersion, limit) =>
      get<BrandSyncPage>('drugCatalog.syncBrands', { sinceVersion, limit }),
    syncBrandPresentations: (sinceVersion, limit) =>
      get<PresentationSyncPage>('drugCatalog.syncBrandPresentations', { sinceVersion, limit }),
  }
}
