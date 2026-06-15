import { searchDrugsApi, getDrugByAtcCodeApi, syncDrugsApi, getDrugPricesApi, enrichDrugApi } from '@/api/drug-catalog'

const TOKEN = 'test-token'
const BASE_URL = 'http://localhost:3004/api/trpc'

function makeResponse<T>(data: T): Response {
  const body = JSON.stringify({ result: { data: { json: data } } })
  return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body } as Response
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_HUB_API_URL = BASE_URL
})

afterEach(() => jest.clearAllMocks())

jest.mock('@/lib/hub-fetch', () => ({
  hubFetch: jest.fn(),
}))

describe('searchDrugsApi', () => {
  it('calls GET with encoded input and Authorization header', async () => {
    const { hubFetch } = jest.requireMock('@/lib/hub-fetch')
    hubFetch.mockResolvedValueOnce(makeResponse([]))

    await searchDrugsApi('amox', 'en', 20, TOKEN)

    expect(hubFetch).toHaveBeenCalledTimes(1)
    const [url, init] = hubFetch.mock.calls[0]
    expect(url).toContain('drugCatalog.search')
    expect(url).toContain('input=')
    expect(url).toContain(encodeURIComponent('"amox"') || 'amox')
    expect(init.headers['Authorization']).toBe(`Bearer ${TOKEN}`)
    expect(init.method).toBe('GET')
  })
})

describe('enrichDrugApi', () => {
  it('calls POST with JSON body', async () => {
    const { hubFetch } = jest.requireMock('@/lib/hub-fetch')
    hubFetch.mockResolvedValueOnce(makeResponse({ atcCode: 'J01CA04' }))

    await enrichDrugApi('J01CA04', { localNames: { prs: 'test' } }, TOKEN)

    expect(hubFetch).toHaveBeenCalledTimes(1)
    const [url, init] = hubFetch.mock.calls[0]
    expect(url).toContain('drugCatalog.enrich')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.json.atcCode).toBe('J01CA04')
  })
})

describe('syncDrugsApi', () => {
  it('returns entries and latestVersion', async () => {
    const { hubFetch } = jest.requireMock('@/lib/hub-fetch')
    hubFetch.mockResolvedValueOnce(makeResponse({ entries: [], latestVersion: 5 }))

    const result = await syncDrugsApi(0, 200, TOKEN)
    expect(result.latestVersion).toBe(5)
    expect(result.entries).toEqual([])
    expect(hubFetch).toHaveBeenCalledTimes(1)
    const [url, init] = hubFetch.mock.calls[0]
    expect(url).toContain('drugCatalog.sync')
    expect(url).toContain('input=')
    expect(init.method).toBe('GET')
    expect(init.headers['Authorization']).toBe(`Bearer ${TOKEN}`)
  })
})

describe('getDrugByAtcCodeApi', () => {
  it('calls GET with atcCode input', async () => {
    const { hubFetch } = jest.requireMock('@/lib/hub-fetch')
    hubFetch.mockResolvedValueOnce(makeResponse({ atcCode: 'J01CA04', innName: 'Amoxicillin' }))

    const result = await getDrugByAtcCodeApi('J01CA04', TOKEN)

    expect(hubFetch).toHaveBeenCalledTimes(1)
    const [url, init] = hubFetch.mock.calls[0]
    expect(url).toContain('drugCatalog.getByAtcCode')
    expect(url).toContain('J01CA04')
    expect(init.method).toBe('GET')
    expect((result as any).atcCode).toBe('J01CA04')
  })
})

describe('getDrugPricesApi', () => {
  it('calls GET with geo and sort params', async () => {
    const { hubFetch } = jest.requireMock('@/lib/hub-fetch')
    hubFetch.mockResolvedValueOnce(makeResponse([]))

    await getDrugPricesApi('J01CA04', 34.5, 69.2, 'distance', 10, TOKEN)

    expect(hubFetch).toHaveBeenCalledTimes(1)
    const [url, init] = hubFetch.mock.calls[0]
    expect(url).toContain('drugCatalog.getPrices')
    expect(init.method).toBe('GET')
    expect(init.headers['Authorization']).toBe(`Bearer ${TOKEN}`)
  })
})
