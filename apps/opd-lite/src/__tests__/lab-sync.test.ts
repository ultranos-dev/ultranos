import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { runLabSync } from '@/lib/lab-sync'

describe('runLabSync', () => {
  it('upserts pulled labs and advances the watermark', async () => {
    await db.open(); await db.labsMirror.clear()
    const client = {
      sync: async (_since?: string) => ({
        labs: [{ id: 'l1', name: 'Kabul Central Laboratory', status: 'active', updatedAt: '2026-09-10T02:00:00Z' }],
        latestUpdatedAt: '2026-09-10T02:00:00Z',
      }),
    }
    const store = {
      getCursor: async () => undefined,
      setCursor: async () => {},
      upsert: async (rows: unknown[]) => { await db.labsMirror.bulkPut(rows as never[]) },
    }
    const res = await runLabSync(store as never, client as never)
    expect(res.synced).toBe(1)
    expect(await db.labsMirror.get('l1')).toBeTruthy()
  })
})
