import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'
import { createMirrorDrugAdapter, resolveDrugAdapter } from '@/lib/mirror-drug-adapter'
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

describe('Pharmacy mirror-backed drug adapter', () => {
  it('flattens entry.interactions into pairwise rows', async () => {
    await db.drugCatalogMirror.put(withInteractions() as never)
    const adapter = createMirrorDrugAdapter()
    const rows = await adapter.getInteractions()
    expect(rows).toContainEqual({
      drugA: 'Warfarin', drugB: 'Aspirin', severity: 'MAJOR', description: 'Additive bleeding risk',
    })
  })

  it('resolveDrugAdapter returns null when the mirror is empty (caller surfaces UNAVAILABLE)', async () => {
    expect(await resolveDrugAdapter()).toBeNull()
  })

  it('resolveDrugAdapter returns an adapter once the mirror is populated', async () => {
    await db.drugCatalogMirror.put(withInteractions() as never)
    expect(await resolveDrugAdapter()).not.toBeNull()
  })
})
