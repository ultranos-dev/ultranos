import { describe, it, expect } from 'vitest'
import { navGroups } from '../components/sidebar/nav-config'

describe('navGroups', () => {
  it('has exactly 4 groups', () => {
    expect(navGroups).toHaveLength(4)
  })

  it('group titles are Core, Clinical, Admin, System', () => {
    const titles = navGroups.map((g) => g.title)
    expect(titles).toEqual(['Core', 'Clinical', 'Admin', 'System'])
  })

  it('every item has a titleKey, url, and icon', () => {
    for (const group of navGroups) {
      for (const item of group.items) {
        expect(item.titleKey).toBeTruthy()
        expect(item.url).toBeTruthy()
        expect(item.icon).toBeTruthy()
      }
    }
  })

  it('all badgeKeys are valid NavBadgeKey values', () => {
    const validKeys = new Set([
      'todayAppointments',
      'notifications',
      'conflicts',
      'duplicateReviews',
      'expiringConsents',
    ])
    for (const group of navGroups) {
      for (const item of group.items) {
        if (item.badgeKey !== undefined) {
          expect(validKeys.has(item.badgeKey)).toBe(true)
        }
      }
    }
  })
})
