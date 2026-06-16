import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { TokenBadge } from '@/components/queue/TokenBadge'
import { TOKEN_COLORS, TOKEN_SYMBOLS } from '@/lib/token-generator'
import type { TokenColor, TokenSymbol } from '@/lib/token-generator'

/**
 * Spec 9.10 — Colorblind accessibility:
 * Every token badge must display a distinct SYMBOL in addition to color.
 * A patient who cannot distinguish colors can still identify their token by symbol.
 */
describe('TokenBadge — colorblind accessibility', () => {
  it('renders a symbol SVG for every color × symbol combination', () => {
    for (const color of TOKEN_COLORS) {
      for (const symbol of TOKEN_SYMBOLS) {
        const { container } = render(
          <TokenBadge color={color as TokenColor} symbol={symbol as TokenSymbol} />,
        )

        // Each badge must contain an SVG element (the symbol icon)
        const svgs = container.querySelectorAll('svg')
        expect(svgs.length).toBeGreaterThan(0)

        // The accessible label must include BOTH color and symbol name
        const badge = container.querySelector('[role="img"]')
        expect(badge).not.toBeNull()
        const label = badge?.getAttribute('aria-label') ?? ''
        expect(label).toContain(color)
        expect(label).toContain(symbol)
      }
    }
  })

  it('never relies on color alone — symbol is always present in accessible label', () => {
    // For every badge, the aria-label must contain a non-color word (the symbol)
    for (const color of TOKEN_COLORS) {
      const { container } = render(
        <TokenBadge color={color as TokenColor} symbol="star" />,
      )
      const badge = container.querySelector('[role="img"]')
      const label = badge?.getAttribute('aria-label') ?? ''

      // Label has both color and symbol — not just the color alone
      expect(label).toContain(color)
      expect(label).toContain('star')
    }
  })

  it('renders an SVG icon for each individual symbol type', () => {
    for (const symbol of TOKEN_SYMBOLS) {
      const { container } = render(
        <TokenBadge color="blue" symbol={symbol as TokenSymbol} />,
      )
      const svgs = container.querySelectorAll('svg')
      expect(svgs.length).toBeGreaterThan(0)
    }
  })
})
