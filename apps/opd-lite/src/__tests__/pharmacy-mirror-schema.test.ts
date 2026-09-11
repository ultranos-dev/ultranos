import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { PRESERVE_TABLES } from '@/lib/phi-cleanup'

describe('pharmaciesMirror', () => {
  it('exists and is a preserved (non-PHI) table', async () => {
    await db.open()
    expect(db.tables.map((t) => t.name)).toContain('pharmaciesMirror')
    expect(PRESERVE_TABLES as readonly string[]).toContain('pharmaciesMirror')
  })
})
