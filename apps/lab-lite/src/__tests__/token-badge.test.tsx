import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TokenBadge } from '@/components/queue/TokenBadge'
import { TOKEN_COLORS, TOKEN_SYMBOLS } from '@/lib/token-generator'

describe('TokenBadge', () => {
  it('renders with correct aria-label', () => {
    render(<TokenBadge color="blue" symbol="star" />)
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'blue star',
    )
  })

  it('renders all 6 colors x 6 symbols without error', () => {
    for (const color of TOKEN_COLORS) {
      for (const symbol of TOKEN_SYMBOLS) {
        const { unmount } = render(<TokenBadge color={color} symbol={symbol} />)
        expect(screen.getByRole('img')).toBeInTheDocument()
        unmount()
      }
    }
  })

  it('renders overflow index when provided', () => {
    render(<TokenBadge color="red" symbol="circle" overflowIndex={2} />)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'red circle 2',
    )
  })

  it('applies correct background color via inline style', () => {
    render(<TokenBadge color="green" symbol="triangle" />)
    const badge = screen.getByRole('img')
    expect(badge).toHaveStyle({ backgroundColor: '#16A34A' })
  })

  it('uses direction: ltr to prevent RTL mirroring', () => {
    render(<TokenBadge color="purple" symbol="diamond" />)
    const badge = screen.getByRole('img')
    expect(badge).toHaveStyle({ direction: 'ltr' })
  })

  it('supports sm, lg, and xl size variants', () => {
    const { unmount: u1 } = render(
      <TokenBadge color="blue" symbol="star" size="sm" />,
    )
    expect(screen.getByRole('img')).toBeInTheDocument()
    u1()

    const { unmount: u2 } = render(
      <TokenBadge color="blue" symbol="star" size="lg" />,
    )
    expect(screen.getByRole('img')).toBeInTheDocument()
    u2()

    render(<TokenBadge color="blue" symbol="star" size="xl" />)
    expect(screen.getByRole('img')).toBeInTheDocument()
  })
})
