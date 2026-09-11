import { describe, it, expect, vi } from 'vitest'
import { pharmacyRouter } from '@/trpc/routers/pharmacy'

function ctx(rows: unknown[]) {
  const q = {
    select: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }
  return { supabase: { from: vi.fn(() => q) }, user: { role: 'DOCTOR' } } as never
}

describe('pharmacy.search', () => {
  it('maps facility rows to directory entries', async () => {
    const caller = pharmacyRouter.createCaller(ctx([
      { id: 'p1', name: 'Kabul City Pharmacy', address: 'Shahr-e Naw', province: 'Kabul', district: 'D10', facility_type: 'pharmacy', updated_at: '2026-09-10T00:00:00Z' },
    ]))
    const res = await caller.search({ q: 'kabul', limit: 20 })
    expect(res[0]).toEqual({ id: 'p1', name: 'Kabul City Pharmacy', address: 'Shahr-e Naw', province: 'Kabul', district: 'D10', facilityType: 'pharmacy', updatedAt: '2026-09-10T00:00:00Z' })
  })
})

describe('pharmacy.sync', () => {
  it('returns rows and the latest watermark', async () => {
    const rows = [
      { id: 'p1', name: 'A', address: null, province: null, district: null, facility_type: 'pharmacy', updated_at: '2026-09-10T01:00:00Z' },
      { id: 'p2', name: 'B', address: null, province: null, district: null, facility_type: 'pharmacy', updated_at: '2026-09-10T02:00:00Z' },
    ]
    const chain = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
    }
    const c = { supabase: { from: vi.fn(() => chain) }, user: { role: 'DOCTOR' } } as never
    const res = await pharmacyRouter.createCaller(c).sync({ limit: 500 })
    expect(res.pharmacies).toHaveLength(2)
    expect(res.latestUpdatedAt).toBe('2026-09-10T02:00:00Z')
  })
})

describe('pharmacy.search — input sanitization', () => {
  it('strips commas from user query before building the .or() filter', async () => {
    const orMock = vi.fn().mockReturnThis()
    const q = {
      select: vi.fn().mockReturnThis(),
      or: orMock,
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    const c = { supabase: { from: vi.fn(() => q) }, user: { role: 'DOCTOR' } } as never
    await pharmacyRouter.createCaller(c).search({ q: 'Al-Hayat, Kabul', limit: 20 })
    expect(orMock).toHaveBeenCalled()
    const orArg: string = orMock.mock.calls[0][0]
    // The user's raw comma-separated value must not appear in the filter string
    expect(orArg).not.toContain('al-hayat, kabul')
    // The sanitized version (comma replaced with space) must be present
    expect(orArg).toContain('al-hayat  kabul')
  })

  it('returns [] immediately when query is only special characters', async () => {
    const fromMock = vi.fn()
    const c = { supabase: { from: fromMock }, user: { role: 'DOCTOR' } } as never
    const res = await pharmacyRouter.createCaller(c).search({ q: ',,()', limit: 20 })
    expect(res).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('pharmacy admin CRUD', () => {
  it('rejects non-admin create', async () => {
    const c = { supabase: { from: vi.fn() }, user: { role: 'DOCTOR' } } as never
    await expect(pharmacyRouter.createCaller(c).create({
      name: 'X', latitude: 34.5, longitude: 69.2,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('inserts a pharmacy for admin', async () => {
    const row = { id: 'p9', name: 'New Pharmacy', latitude: 34.5, longitude: 69.2, facility_type: 'pharmacy', is_active: true }
    const chain = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: row, error: null }) }
    const c = { supabase: { from: vi.fn(() => chain) }, user: { role: 'ADMIN' } } as never
    const res = await pharmacyRouter.createCaller(c).create({ name: 'New Pharmacy', latitude: 34.5, longitude: 69.2 })
    expect(res.id).toBe('p9')
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ facility_type: 'pharmacy', is_active: true }))
  })
})
