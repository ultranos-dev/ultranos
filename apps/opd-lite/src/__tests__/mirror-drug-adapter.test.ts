import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createMirrorDrugAdapter } from '@/lib/mirror-drug-adapter'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

const withInteractions = (): DrugEntry =>
  ({
    atcCode: 'B01AA03', innName: 'Warfarin', brandNames: [], doseForms: ['tablet'], therapeuticClass: '',
    interactions: [
      { drugAtcCode: 'N02BA01', drugName: 'Aspirin', severity: 'MAJOR', mechanism: 'Additive bleeding risk' },
    ],
  }) as unknown as DrugEntry

beforeEach(async () => {
  await db.open()
  await db.drugCatalogMirror.clear()
  await db.drugCatalogSyncMeta.clear()
})

describe('mirror-backed drug adapter', () => {
  it('flattens entry.interactions into pairwise vocab rows', async () => {
    await db.drugCatalogMirror.put(withInteractions() as never)
    const adapter = createMirrorDrugAdapter()
    const rows = await adapter.getInteractions()
    expect(rows).toContainEqual({
      drugA: 'Warfarin', drugB: 'Aspirin', severity: 'MAJOR', description: 'Additive bleeding risk',
    })
  })

  it('reports metadata from the catalog cursor', async () => {
    await db.drugCatalogSyncMeta.put({ key: 'lastSyncAt', value: '2026-06-23T00:00:00.000Z' })
    await db.drugCatalogSyncMeta.put({ key: 'catalogVersion', value: '99' })
    const adapter = createMirrorDrugAdapter()
    const meta = await adapter.getMetadata!()
    expect(meta?.version).toBe(99)
    expect(meta?.lastUpdatedAt).toBe('2026-06-23T00:00:00.000Z')
  })
})
