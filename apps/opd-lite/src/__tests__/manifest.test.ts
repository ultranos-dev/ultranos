import { describe, it, expect } from 'vitest'
import manifest from '../app/manifest'

describe('PWA manifest', () => {
  const m = manifest()

  it('exports all required fields', () => {
    expect(m.name).toBe('Ultranos OPD Lite')
    expect(m.short_name).toBe('OPD Lite')
    expect(m.description).toBeDefined()
    expect(m.start_url).toBe('/')
    expect(m.theme_color).toBe('#1e40af')
    expect(m.background_color).toBe('#f9fafb')
  })

  it('sets display to standalone', () => {
    expect(m.display).toBe('standalone')
  })

  it('includes 192px and 512px icons', () => {
    expect(m.icons).toBeDefined()
    const icons = m.icons!
    expect(icons).toHaveLength(2)

    const icon192 = icons.find((i) => i.sizes === '192x192')
    expect(icon192).toBeDefined()
    expect(icon192!.type).toBe('image/png')

    const icon512 = icons.find((i) => i.sizes === '512x512')
    expect(icon512).toBeDefined()
    expect(icon512!.type).toBe('image/png')
  })

  it('icons have purpose set to any maskable', () => {
    const icons = m.icons!
    for (const icon of icons) {
      // W3C manifest spec allows space-separated purposes
      expect(icon.purpose).toBe('any maskable')
    }
  })
})
