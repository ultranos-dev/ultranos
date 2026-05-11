import { describe, it, expect } from 'vitest'
import manifest from '../app/manifest'

describe('PWA manifest', () => {
  const m = manifest()

  it('has correct name and short_name', () => {
    expect(m.name).toBe('Pharmacy Lite — Prescription Fulfillment')
    expect(m.short_name).toBe('PharmacyLite')
  })

  it('uses standalone display mode', () => {
    expect(m.display).toBe('standalone')
  })

  it('has start_url set to root', () => {
    expect(m.start_url).toBe('/')
  })

  it('provides 192px and 512px icons', () => {
    expect(m.icons).toHaveLength(2)
    expect(m.icons).toContainEqual(
      expect.objectContaining({ sizes: '192x192', type: 'image/png' })
    )
    expect(m.icons).toContainEqual(
      expect.objectContaining({ sizes: '512x512', type: 'image/png' })
    )
  })

  it('has theme_color and background_color defined', () => {
    expect(m.theme_color).toBeDefined()
    expect(m.background_color).toBeDefined()
  })
})
