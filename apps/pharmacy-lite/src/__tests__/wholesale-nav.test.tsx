import { describe, it, expect } from 'vitest'
import { navGroups } from '@/components/sidebar/nav-config'
import { filterNavGroups } from '@/components/sidebar/nav-config'

describe('wholesale nav gating', () => {
  it('includes a Wholesale group definition', () => {
    expect(navGroups.some((g) => g.title === 'Wholesale')).toBe(true)
  })
  it('hides the Wholesale group when wholesale mode is off', () => {
    const visible = filterNavGroups(navGroups, { enableWholesale: false })
    expect(visible.some((g) => g.title === 'Wholesale')).toBe(false)
  })
  it('shows the Wholesale group when wholesale mode is on', () => {
    const visible = filterNavGroups(navGroups, { enableWholesale: true })
    expect(visible.some((g) => g.title === 'Wholesale')).toBe(true)
  })
})
