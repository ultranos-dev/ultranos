import { describe, it, expect } from 'vitest'
import { Colors, ColorsDark } from '@ultranos/ui-kit/tokens.native'

const SEMANTIC_KEYS = [
  'surface', 'surfaceElevated', 'surfaceSubtle',
  'textPrimary', 'textSecondary', 'textMuted',
  'border', 'borderSubtle', 'overlay',
] as const

describe('tokens.native — theme colors', () => {
  it('Colors has all semantic keys', () => {
    for (const key of SEMANTIC_KEYS) {
      expect(Colors).toHaveProperty(key)
      expect(typeof Colors[key]).toBe('string')
    }
  })

  it('ColorsDark has all semantic keys', () => {
    for (const key of SEMANTIC_KEYS) {
      expect(ColorsDark).toHaveProperty(key)
      expect(typeof ColorsDark[key]).toBe('string')
    }
  })

  it('ColorsDark has same accent colors as Colors', () => {
    expect(ColorsDark.primary500).toBe(Colors.primary500)
    expect(ColorsDark.danger).toBe(Colors.danger)
    expect(ColorsDark.warning).toBe(Colors.warning)
    expect(ColorsDark.success).toBe(Colors.success)
  })

  it('surface values differ between light and dark', () => {
    expect(Colors.surface).not.toBe(ColorsDark.surface)
    expect(Colors.surfaceElevated).not.toBe(ColorsDark.surfaceElevated)
    expect(Colors.textPrimary).not.toBe(ColorsDark.textPrimary)
  })
})
