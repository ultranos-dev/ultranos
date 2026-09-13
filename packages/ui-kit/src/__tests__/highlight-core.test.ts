import { describe, it, expect } from 'vitest'
import { getMatchIndices, segmentsByIndices, segmentsByQuery } from '../lib/highlight-core'

describe('segmentsByQuery', () => {
  it('splits a case-insensitive substring match into highlighted + plain segments', () => {
    expect(segmentsByQuery('Kabul City', 'kab')).toEqual([
      { text: 'Kab', highlighted: true },
      { text: 'ul City', highlighted: false },
    ])
  })

  it('highlights every occurrence', () => {
    const segs = segmentsByQuery('cocoa', 'co')
    expect(segs.filter((s) => s.highlighted)).toHaveLength(2)
  })

  it('returns a single plain segment when there is no match', () => {
    expect(segmentsByQuery('Herat', 'zzz')).toEqual([{ text: 'Herat', highlighted: false }])
  })

  it('returns a single plain segment for an empty query', () => {
    expect(segmentsByQuery('Herat', '  ')).toEqual([{ text: 'Herat', highlighted: false }])
  })
})

describe('segmentsByIndices', () => {
  it('splits Fuse index ranges into highlighted + plain segments', () => {
    expect(segmentsByIndices('Amoxicillin', [[0, 3]])).toEqual([
      { text: 'Amox', highlighted: true },
      { text: 'icillin', highlighted: false },
    ])
  })

  it('merges adjacent/overlapping ranges', () => {
    const segs = segmentsByIndices('abcdef', [[0, 1], [2, 3]])
    expect(segs).toEqual([
      { text: 'abcd', highlighted: true },
      { text: 'ef', highlighted: false },
    ])
  })

  it('returns a single plain segment when there are no indices', () => {
    expect(segmentsByIndices('Amoxicillin', undefined)).toEqual([{ text: 'Amoxicillin', highlighted: false }])
  })
})

describe('getMatchIndices', () => {
  it('returns indices for the given key', () => {
    expect(getMatchIndices([{ key: 'name', indices: [[0, 2]] }], 'name')).toEqual([[0, 2]])
  })

  it('returns undefined when matches is undefined', () => {
    expect(getMatchIndices(undefined, 'name')).toBeUndefined()
  })
})
