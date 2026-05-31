import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { TokenBadge } from '@/components/queue/TokenBadge'

// Mock next-intl for TokenCard
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const msgs: Record<string, string> = {
      'color.blue': 'Blue',
      'color.red': 'Red',
      'symbol.star': 'Star',
      'symbol.circle': 'Circle',
      printToken: 'Print Token',
    }
    return msgs[key] ?? key
  },
}))

import { TokenCard } from '@/components/queue/TokenCard'

afterEach(() => {
  document.dir = 'ltr'
})

describe('TokenBadge RTL snapshots', () => {
  it('renders in LTR', () => {
    document.dir = 'ltr'
    const { container } = render(
      <TokenBadge color="blue" symbol="star" size="lg" />,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders in RTL', () => {
    document.dir = 'rtl'
    const { container } = render(
      <TokenBadge color="blue" symbol="star" size="lg" />,
    )
    expect(container).toMatchSnapshot()
  })

  it('token badge uses direction: ltr regardless of document direction', () => {
    document.dir = 'rtl'
    const { container } = render(
      <TokenBadge color="red" symbol="circle" size="sm" />,
    )
    const badge = container.querySelector('[role="img"]')
    expect(badge).toHaveStyle({ direction: 'ltr' })
  })
})

describe('TokenCard RTL snapshots', () => {
  it('renders in LTR', () => {
    document.dir = 'ltr'
    const { container } = render(
      <TokenCard color="blue" symbol="star" queuePosition={1} />,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders in RTL', () => {
    document.dir = 'rtl'
    const { container } = render(
      <TokenCard color="blue" symbol="star" queuePosition={1} />,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders printable layout with token and localized name', () => {
    const { getByTestId, getByText } = render(
      <TokenCard color="blue" symbol="star" queuePosition={3} />,
    )
    expect(getByTestId('token-card')).toBeInTheDocument()
    expect(getByText('Blue Star')).toBeInTheDocument()
    expect(getByText('#3')).toBeInTheDocument()
  })

  it('renders overflow index in card name', () => {
    const { getByText } = render(
      <TokenCard
        color="red"
        symbol="circle"
        overflowIndex={2}
        queuePosition={5}
      />,
    )
    expect(getByText('Red Circle 2')).toBeInTheDocument()
  })
})
