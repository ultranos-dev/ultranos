import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'
import { runDispenseInteractionCheck } from '@/lib/dispense-interaction-check'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

const warfarin = (): DrugEntry =>
  ({ atcCode: 'B01AA03', innName: 'Warfarin', brandNames: [], doseForms: [], therapeuticClass: '',
     interactions: [{ drugAtcCode: 'N02BA01', drugName: 'Aspirin', severity: 'MAJOR', mechanism: 'Bleeding risk' }] }) as unknown as DrugEntry

beforeEach(async () => {
  await db.open(); await db.drugCatalogMirror.clear(); await db.drugCatalogSyncMeta.clear()
})

describe('runDispenseInteractionCheck', () => {
  it('returns unavailable when the mirror is empty (never CLEAR — rule #3)', async () => {
    const status = await runDispenseInteractionCheck(['Warfarin', 'Aspirin'], [])
    expect(status.state).toBe('unavailable')
  })

  it('flags a MAJOR intra-prescription interaction as contraindicated/blocking', async () => {
    await db.drugCatalogMirror.put(warfarin() as never)
    await db.drugCatalogSyncMeta.put({ key: 'lastSyncAt', value: new Date().toISOString() })
    const status = await runDispenseInteractionCheck(['Warfarin', 'Aspirin'], [])
    expect(status.state).toBe('contraindicated')
  })

  it('blocks on a patient allergy match (ALLERGY_MATCH is contraindicated)', async () => {
    await db.drugCatalogMirror.put(warfarin() as never) // populate the mirror so the adapter is non-null
    await db.drugCatalogSyncMeta.put({ key: 'lastSyncAt', value: new Date().toISOString() })
    const status = await runDispenseInteractionCheck(['Aspirin'], ['Aspirin'])
    expect(status.state).toBe('contraindicated')
  })

  it('returns unavailable (never clear) when there are no medications to check', async () => {
    await db.drugCatalogMirror.put(warfarin() as never)
    await db.drugCatalogSyncMeta.put({ key: 'lastSyncAt', value: new Date().toISOString() })
    const status = await runDispenseInteractionCheck([], [])
    expect(status.state).toBe('unavailable')
  })
})
