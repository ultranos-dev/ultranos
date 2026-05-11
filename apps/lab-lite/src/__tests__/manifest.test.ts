import { describe, it, expect } from 'vitest'
import manifest from '../app/manifest'

describe('manifest()', () => {
  const result = manifest()

  it('returns correct name and short_name', () => {
    expect(result.name).toBe('Lab Lite')
    expect(result.short_name).toBe('LabLite')
  })

  it('returns correct description', () => {
    expect(result.description).toBe('Ultranos Lab Lite — Diagnostic Results Upload')
  })

  it('uses standalone display mode', () => {
    expect(result.display).toBe('standalone')
  })

  it('sets start_url to root', () => {
    expect(result.start_url).toBe('/')
  })

  it('includes 192 and 512 icons', () => {
    expect(result.icons).toEqual([
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ])
  })

  it('sets theme_color and background_color', () => {
    expect(result.theme_color).toBe('#0d6a51')
    expect(result.background_color).toBe('#fafafa')
  })
})
