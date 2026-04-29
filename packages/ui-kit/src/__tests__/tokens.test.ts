import { describe, it, expect } from 'vitest'
import { typography, colors, spacing, letterSpacing, borderRadius, shadows, transitions } from '../tokens.js'

describe('typography tokens', () => {
  it('uses Inter as primary font family', () => {
    expect(typography.fontFamily.sans).toContain('Inter')
  })

  it('defines base font size as 1rem', () => {
    expect(typography.fontSize.base).toBe('1rem')
  })

  it('defines all expected font weights', () => {
    expect(typography.fontWeight.normal).toBe(400)
    expect(typography.fontWeight.medium).toBe(500)
    expect(typography.fontWeight.semibold).toBe(600)
    expect(typography.fontWeight.bold).toBe(700)
  })

  it('defines line heights', () => {
    expect(typography.lineHeight.tight).toBe(1.25)
    expect(typography.lineHeight.normal).toBe(1.5)
    expect(typography.lineHeight.relaxed).toBe(1.75)
  })
})

describe('color tokens', () => {
  it('defines primary colors using HSL', () => {
    expect(colors.primary[500]).toMatch(/^hsl\(/)
  })

  it('defines all 10 primary shades', () => {
    const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const
    for (const shade of shades) {
      expect(colors.primary[shade]).toBeDefined()
    }
  })

  it('defines semantic colors', () => {
    expect(colors.danger).toMatch(/^hsl\(/)
    expect(colors.warning).toMatch(/^hsl\(/)
    expect(colors.success).toMatch(/^hsl\(/)
    expect(colors.info).toMatch(/^hsl\(/)
  })

  it('defines allergy color for clinical prominence', () => {
    expect(colors.allergy).toMatch(/^hsl\(/)
  })
})

describe('spacing tokens', () => {
  it('defines spacing scale in rem', () => {
    expect(spacing[1]).toBe('0.25rem')
    expect(spacing[4]).toBe('1rem')
    expect(spacing[8]).toBe('2rem')
  })
})

describe('letterSpacing tokens', () => {
  it('defines letter spacing values', () => {
    expect(letterSpacing.tight).toBe('-0.02em')
    expect(letterSpacing.normal).toBe('0')
    expect(letterSpacing.wide).toBe('0.025em')
  })
})

describe('borderRadius tokens', () => {
  it('defines border radius scale', () => {
    expect(borderRadius.sm).toBe('0.25rem')
    expect(borderRadius.full).toBe('9999px')
  })
})

describe('shadows tokens', () => {
  it('defines shadow values', () => {
    expect(shadows.sm).toBeDefined()
    expect(shadows.md).toBeDefined()
    expect(shadows.lg).toBeDefined()
  })
})

describe('transitions tokens', () => {
  it('defines transition values', () => {
    expect(transitions.fast).toBe('150ms ease')
    expect(transitions.normal).toBe('250ms ease')
  })
})
