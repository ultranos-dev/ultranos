import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CHECKLIST_ITEMS,
  CHECKLIST_CATEGORIES,
} from '../lib/safety/default-checklist'

// ---------------------------------------------------------------------------
// DEFAULT_CHECKLIST_ITEMS
// ---------------------------------------------------------------------------

describe('DEFAULT_CHECKLIST_ITEMS', () => {
  it('contains 20 items', () => {
    expect(DEFAULT_CHECKLIST_ITEMS.length).toBe(20)
  })

  it('all items have isDefault: true', () => {
    for (const item of DEFAULT_CHECKLIST_ITEMS) {
      expect(item.isDefault).toBe(true)
    }
  })

  it('all items have isActive: true', () => {
    for (const item of DEFAULT_CHECKLIST_ITEMS) {
      expect(item.isActive).toBe(true)
    }
  })

  it('all items have unique IDs', () => {
    const ids = DEFAULT_CHECKLIST_ITEMS.map((item) => item.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(DEFAULT_CHECKLIST_ITEMS.length)
  })

  it('has items in all 6 categories', () => {
    const presentCategories = new Set(
      DEFAULT_CHECKLIST_ITEMS.map((item) => item.category),
    )
    for (const category of CHECKLIST_CATEGORIES) {
      expect(presentCategories.has(category)).toBe(true)
    }
  })

  it('orders are globally unique and all greater than 0', () => {
    const orders = DEFAULT_CHECKLIST_ITEMS.map((item) => item.order)
    const uniqueOrders = new Set(orders)
    expect(uniqueOrders.size).toBe(DEFAULT_CHECKLIST_ITEMS.length)
    for (const order of orders) {
      expect(order).toBeGreaterThan(0)
    }
  })

  it('sharps container item requires photo', () => {
    const sharpItem = DEFAULT_CHECKLIST_ITEMS.find(
      (item) => item.id === 'ic-sw-01',
    )
    expect(sharpItem).toBeDefined()
    expect(sharpItem!.requiresPhoto).toBe(true)
  })

  it('Hand Hygiene has 3 items', () => {
    const handHygieneItems = DEFAULT_CHECKLIST_ITEMS.filter(
      (item) => item.category === 'Hand Hygiene',
    )
    expect(handHygieneItems.length).toBe(3)
  })

  it('General has 4 items', () => {
    const generalItems = DEFAULT_CHECKLIST_ITEMS.filter(
      (item) => item.category === 'General',
    )
    expect(generalItems.length).toBe(4)
  })

  it('descriptions are non-empty strings', () => {
    for (const item of DEFAULT_CHECKLIST_ITEMS) {
      expect(typeof item.description).toBe('string')
      expect(item.description.length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// CHECKLIST_CATEGORIES
// ---------------------------------------------------------------------------

describe('CHECKLIST_CATEGORIES', () => {
  it('contains all 6 categories in correct order', () => {
    expect(CHECKLIST_CATEGORIES).toEqual([
      'Hand Hygiene',
      'PPE',
      'Sharps & Waste',
      'Surface Decontamination',
      'Equipment',
      'General',
    ])
  })
})
