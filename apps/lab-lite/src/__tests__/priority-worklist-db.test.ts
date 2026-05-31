import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  getDb,
  getPriorityOverrides,
  setPriorityOverride,
  clearPriorityOverride,
  clearAllPriorityOverrides,
} from '@/lib/db'

describe('Priority override Dexie helpers (v20)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.priorityOverrides.clear()
  })

  it('getPriorityOverrides returns empty array when no overrides', async () => {
    const result = await getPriorityOverrides()
    expect(result).toEqual([])
  })

  it('setPriorityOverride adds an entry', async () => {
    await setPriorityOverride('sample-abc', 2)
    const result = await getPriorityOverrides()
    expect(result).toHaveLength(1)
    expect(result[0].sampleId).toBe('sample-abc')
    expect(result[0].manualPosition).toBe(2)
    expect(result[0].overriddenAt).toBeDefined()
  })

  it('setPriorityOverride replaces existing entry for same sampleId', async () => {
    await setPriorityOverride('sample-abc', 2)
    await setPriorityOverride('sample-abc', 5)
    const result = await getPriorityOverrides()
    expect(result).toHaveLength(1)
    expect(result[0].manualPosition).toBe(5)
  })

  it('clearPriorityOverride removes an entry', async () => {
    await setPriorityOverride('sample-abc', 0)
    await setPriorityOverride('sample-xyz', 1)
    await clearPriorityOverride('sample-abc')
    const result = await getPriorityOverrides()
    expect(result).toHaveLength(1)
    expect(result[0].sampleId).toBe('sample-xyz')
  })

  it('clearAllPriorityOverrides removes all entries', async () => {
    await setPriorityOverride('sample-a', 0)
    await setPriorityOverride('sample-b', 1)
    await clearAllPriorityOverrides()
    const result = await getPriorityOverrides()
    expect(result).toHaveLength(0)
  })

  it('overriddenAt is a valid ISO timestamp', async () => {
    await setPriorityOverride('sample-ts', 3)
    const result = await getPriorityOverrides()
    const ts = result[0].overriddenAt
    expect(new Date(ts).getTime()).not.toBeNaN()
  })

  it('multiple overrides can coexist', async () => {
    await setPriorityOverride('sample-1', 0)
    await setPriorityOverride('sample-2', 1)
    await setPriorityOverride('sample-3', 2)
    const result = await getPriorityOverrides()
    expect(result).toHaveLength(3)
  })
})
