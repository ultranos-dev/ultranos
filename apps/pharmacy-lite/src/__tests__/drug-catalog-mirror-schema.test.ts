import { describe, it, expect } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'
import { PHI_TABLES, PRESERVE_TABLES } from '@/lib/phi-cleanup'

describe('drug-catalog mirror schema (pharmacy v13)', () => {
  it('creates the mirror + cursor tables', async () => {
    await db.open()
    const names = db.tables.map((t) => t.name)
    expect(names).toContain('drugCatalogMirror')
    expect(names).toContain('drugBrandsMirror')
    expect(names).toContain('drugBrandPresentationsMirror')
    expect(names).toContain('drugCatalogSyncMeta')
  })

  it('round-trips a mirror drug keyed by atcCode (plaintext)', async () => {
    await db.drugCatalogMirror.put({
      atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: ['Amoxil'],
      doseForms: ['capsule'], therapeuticClass: 'Penicillins',
    } as never)
    const row = await db.drugCatalogMirror.get('J01CA04')
    expect(row?.innName).toBe('Amoxicillin')
  })

  it('classifies the new tables as non-PHI (PRESERVE_TABLES)', async () => {
    for (const t of ['drugCatalogMirror', 'drugBrandsMirror', 'drugBrandPresentationsMirror', 'drugCatalogSyncMeta']) {
      expect(PRESERVE_TABLES as readonly string[]).toContain(t)
      expect(PHI_TABLES as readonly string[]).not.toContain(t)
    }
  })
})
