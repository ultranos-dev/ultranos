import { describe, it, expect } from 'vitest'
import { createCatalogClient } from '../client.js'

function fakeResponse(json: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => json } as unknown as Response
}

describe('createCatalogClient', () => {
  it('syncDrugs calls drugCatalog.sync with a bearer token and decodes the json envelope', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const client = createCatalogClient({
      baseUrl: 'http://hub.test/api/trpc',
      getToken: async () => 'tok123',
      fetchImpl: (async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        return fakeResponse({
          result: { data: { json: { entries: [{ atcCode: 'J01CA04' }], latestVersion: 42 } } },
        })
      }) as unknown as typeof fetch,
    })

    const page = await client.syncDrugs(0, 200)

    expect(page.latestVersion).toBe(42)
    expect(page.entries).toHaveLength(1)
    const u = new URL(calls[0]!.url)
    expect(u.pathname).toBe('/api/trpc/drugCatalog.sync')
    expect(JSON.parse(u.searchParams.get('input')!)).toEqual({ json: { sinceVersion: 0, limit: 200 } })
    expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe('Bearer tok123')
  })

  it('syncBrands and syncBrandPresentations target their own paths', async () => {
    const paths: string[] = []
    const client = createCatalogClient({
      baseUrl: 'http://hub.test/api/trpc',
      getToken: async () => 'tok',
      fetchImpl: (async (url: string) => {
        paths.push(new URL(url).pathname)
        return fakeResponse({ result: { data: { json: { brands: [], presentations: [], latestVersion: 0 } } } })
      }) as unknown as typeof fetch,
    })
    await client.syncBrands(0, 200)
    await client.syncBrandPresentations(0, 200)
    expect(paths).toEqual(['/api/trpc/drugCatalog.syncBrands', '/api/trpc/drugCatalog.syncBrandPresentations'])
  })

  it('throws when no token is available', async () => {
    const client = createCatalogClient({
      baseUrl: 'http://hub.test/api/trpc',
      getToken: async () => null,
      fetchImpl: (async () => fakeResponse({})) as unknown as typeof fetch,
    })
    await expect(client.syncDrugs(0, 200)).rejects.toThrow('authentication required')
  })

  it('throws on a non-ok response', async () => {
    const client = createCatalogClient({
      baseUrl: 'http://hub.test/api/trpc',
      getToken: async () => 'tok',
      fetchImpl: (async () => fakeResponse({}, false, 500)) as unknown as typeof fetch,
    })
    await expect(client.syncDrugs(0, 200)).rejects.toThrow('failed: 500')
  })
})
