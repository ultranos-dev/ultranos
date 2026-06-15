import { describe, it, expect } from 'vitest'
import {
  TOKEN_COLORS,
  TOKEN_SYMBOLS,
  generateToken,
  recycleToken,
  generateTokenWithOverflow,
  type QueueToken,
} from '@/lib/token-generator'

describe('token-generator', () => {
  describe('generateToken', () => {
    it('produces a valid color + symbol combination', () => {
      const token = generateToken([])
      expect(TOKEN_COLORS).toContain(token.color)
      expect(TOKEN_SYMBOLS).toContain(token.symbol)
      expect(token.displayKey).toBe(`${token.color}-${token.symbol}`)
    })

    it('avoids collisions with active tokens', () => {
      const active: QueueToken[] = [
        { color: 'red', symbol: 'star', displayKey: 'red-star' },
      ]
      // Generate many tokens — none should match the active one
      for (let i = 0; i < 50; i++) {
        const token = generateToken(active)
        expect(token.displayKey).not.toBe('red-star')
      }
    })

    it('uses all 36 slots before any collision', () => {
      const active: QueueToken[] = []
      const seen = new Set<string>()
      for (let i = 0; i < 36; i++) {
        const token = generateToken(active)
        expect(seen.has(token.displayKey)).toBe(false)
        seen.add(token.displayKey)
        active.push(token)
      }
      expect(seen.size).toBe(36)
    })

    it('throws when all 36 base tokens are exhausted', () => {
      const active = buildFullPool()
      expect(() => generateToken(active)).toThrow()
    })
  })

  describe('recycleToken', () => {
    it('removes the specified token from the active set', () => {
      const active: QueueToken[] = [
        { color: 'red', symbol: 'star', displayKey: 'red-star' },
        { color: 'blue', symbol: 'circle', displayKey: 'blue-circle' },
      ]
      const result = recycleToken(active[0], active)
      expect(result).toHaveLength(1)
      expect(result[0].displayKey).toBe('blue-circle')
    })

    it('returns original array unchanged if token not found', () => {
      const active: QueueToken[] = [
        { color: 'red', symbol: 'star', displayKey: 'red-star' },
      ]
      const unknown: QueueToken = {
        color: 'green',
        symbol: 'triangle',
        displayKey: 'green-triangle',
      }
      const result = recycleToken(unknown, active)
      expect(result).toHaveLength(1)
    })
  })

  describe('generateTokenWithOverflow', () => {
    it('returns a base token when pool is not exhausted', () => {
      const token = generateTokenWithOverflow([])
      expect(token.displayKey).not.toContain(' ')
      expect(token.overflowIndex).toBeUndefined()
    })

    it('appends numeric suffix when all 36 are in use', () => {
      const active = buildFullPool()
      const token = generateTokenWithOverflow(active)
      expect(token.overflowIndex).toBe(2)
      // displayKey should encode the overflow, e.g. "red-star-2"
      expect(token.displayKey).toMatch(/-\d+$/)
    })

    it('increments suffix when overflow slot is also taken', () => {
      const active = buildFullPool()
      // Add one overflow token
      const first = generateTokenWithOverflow(active)
      active.push(first)
      const second = generateTokenWithOverflow(active)
      // Either a different base combo with suffix 2 or same combo with suffix 3
      expect(second.overflowIndex).toBeGreaterThanOrEqual(2)
      expect(second.displayKey).not.toBe(first.displayKey)
    })
  })
})

/** Build a full pool of all 36 base tokens. */
function buildFullPool(): QueueToken[] {
  const pool: QueueToken[] = []
  for (const color of TOKEN_COLORS) {
    for (const symbol of TOKEN_SYMBOLS) {
      pool.push({ color, symbol, displayKey: `${color}-${symbol}` })
    }
  }
  return pool
}
