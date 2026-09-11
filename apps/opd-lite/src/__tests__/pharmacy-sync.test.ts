import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { runPharmacySync } from '@/lib/pharmacy-sync'

describe('runPharmacySync', () => {
  it('upserts pulled pharmacies and advances the watermark', async () => {
    await db.open(); await db.pharmaciesMirror.clear()
    const client = {
      sync: async (_since?: string) => ({
        pharmacies: [{ id: 'p1', name: 'Kabul City Pharmacy', facilityType: 'pharmacy', province: 'Kabul', updatedAt: '2026-09-10T02:00:00Z' }],
        latestUpdatedAt: '2026-09-10T02:00:00Z',
      }),
    }
    const store = {
      getCursor: async () => undefined,
      setCursor: async () => {},
      upsert: async (rows: unknown[]) => { await db.pharmaciesMirror.bulkPut(rows as never[]) },
    }
    const res = await runPharmacySync(store as never, client as never)
    expect(res.synced).toBe(1)
    expect(await db.pharmaciesMirror.get('p1')).toBeTruthy()
  })
})
