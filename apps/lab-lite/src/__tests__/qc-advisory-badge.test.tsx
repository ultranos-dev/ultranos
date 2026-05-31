/**
 * Story 43.2 — QC Advisory Badge Tests (Task 9.5)
 * Renders correctly for all warning states; null renders nothing.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const msgs: Record<string, string> = {
      'badge.qcAdvisory': 'QC Advisory',
      'badge.qcDrift': 'QC Drift',
      'badge.noQc': 'No QC',
    }
    return msgs[key] ?? key
  },
}))

import { QcAdvisoryBadge } from '@/components/qc/QcAdvisoryBadge'

describe('QcAdvisoryBadge — null warning (Task 9.5)', () => {
  it('renders nothing when qcWarning is null', () => {
    const { container } = render(<QcAdvisoryBadge qcWarning={null} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('QcAdvisoryBadge — QC_FAILING (Task 9.5)', () => {
  it('renders QC_FAILING badge with advisory label', () => {
    render(<QcAdvisoryBadge qcWarning="QC_FAILING" />)
    expect(screen.getByText('QC Advisory')).toBeInTheDocument()
  })

  it('QC_FAILING badge has red styling', () => {
    const { container } = render(<QcAdvisoryBadge qcWarning="QC_FAILING" />)
    const badge = container.querySelector('span')!
    // Red background color
    expect(badge.style.backgroundColor).toBe('rgb(254, 242, 242)')
    expect(badge.style.color).toBe('rgb(153, 27, 27)')
  })

  it('QC_FAILING snapshot', () => {
    const { container } = render(<QcAdvisoryBadge qcWarning="QC_FAILING" />)
    expect(container).toMatchSnapshot()
  })
})

describe('QcAdvisoryBadge — QC_DRIFT (Task 9.5)', () => {
  it('renders QC_DRIFT badge with drift label', () => {
    render(<QcAdvisoryBadge qcWarning="QC_DRIFT" />)
    expect(screen.getByText('QC Drift')).toBeInTheDocument()
  })

  it('QC_DRIFT badge has orange styling', () => {
    const { container } = render(<QcAdvisoryBadge qcWarning="QC_DRIFT" />)
    const badge = container.querySelector('span')!
    expect(badge.style.backgroundColor).toBe('rgb(255, 247, 237)')
    expect(badge.style.color).toBe('rgb(154, 52, 18)')
  })

  it('QC_DRIFT snapshot', () => {
    const { container } = render(<QcAdvisoryBadge qcWarning="QC_DRIFT" />)
    expect(container).toMatchSnapshot()
  })
})

describe('QcAdvisoryBadge — NO_QC_TODAY (Task 9.5)', () => {
  it('renders NO_QC_TODAY badge with no-QC label', () => {
    render(<QcAdvisoryBadge qcWarning="NO_QC_TODAY" />)
    expect(screen.getByText('No QC')).toBeInTheDocument()
  })

  it('NO_QC_TODAY badge has amber styling', () => {
    const { container } = render(<QcAdvisoryBadge qcWarning="NO_QC_TODAY" />)
    const badge = container.querySelector('span')!
    expect(badge.style.backgroundColor).toBe('rgb(255, 251, 235)')
    expect(badge.style.color).toBe('rgb(146, 64, 14)')
  })

  it('NO_QC_TODAY snapshot', () => {
    const { container } = render(<QcAdvisoryBadge qcWarning="NO_QC_TODAY" />)
    expect(container).toMatchSnapshot()
  })
})

describe('QcAdvisoryBadge — accessibility (Task 9.5)', () => {
  it('badge uses inline-flex display', () => {
    const { container } = render(<QcAdvisoryBadge qcWarning="QC_FAILING" />)
    const badge = container.querySelector('span')!
    expect(badge.style.display).toBe('inline-flex')
  })

  it('badge uses paddingInline for RTL compatibility', () => {
    const { container } = render(<QcAdvisoryBadge qcWarning="QC_FAILING" />)
    const badge = container.querySelector('span')!
    // paddingInline is a logical CSS property set inline — verify via getAttribute
    const style = badge.getAttribute('style') ?? ''
    expect(style).toContain('padding-inline')
  })
})
