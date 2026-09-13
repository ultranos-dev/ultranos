import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { highlightMatches, getMatchIndices, highlightQuery } from '../lib/highlight'

describe('highlightQuery', () => {
  it('wraps the case-insensitive query substring in <mark>', () => {
    const { container } = render(<div>{highlightQuery('Kabul City Pharmacy', 'kab')}</div>)
    expect(container.querySelector('mark')?.textContent).toBe('Kab')
  })

  it('highlights every occurrence', () => {
    const { container } = render(<div>{highlightQuery('cocoa', 'co')}</div>)
    expect(container.querySelectorAll('mark')).toHaveLength(2)
  })

  it('returns plain text when there is no match', () => {
    const { container } = render(<div>{highlightQuery('Herat', 'zzz')}</div>)
    expect(container.querySelector('mark')).toBeNull()
    expect(container.textContent).toBe('Herat')
  })

  it('returns plain text for an empty query', () => {
    const { container } = render(<div>{highlightQuery('Herat', '  ')}</div>)
    expect(container.querySelector('mark')).toBeNull()
  })
})

describe('highlightMatches', () => {
  it('wraps Fuse index ranges in <mark>', () => {
    const { container } = render(<div>{highlightMatches('Amoxicillin', [[0, 3]])}</div>)
    expect(container.querySelector('mark')?.textContent).toBe('Amox')
  })

  it('returns plain text when there are no indices', () => {
    const { container } = render(<div>{highlightMatches('Amoxicillin', undefined)}</div>)
    expect(container.querySelector('mark')).toBeNull()
  })
})

describe('getMatchIndices', () => {
  it('returns indices for the given key', () => {
    const matches = [{ key: 'name', indices: [[0, 2]] as [number, number][] }]
    expect(getMatchIndices(matches, 'name')).toEqual([[0, 2]])
  })

  it('returns undefined when matches is undefined', () => {
    expect(getMatchIndices(undefined, 'name')).toBeUndefined()
  })
})
