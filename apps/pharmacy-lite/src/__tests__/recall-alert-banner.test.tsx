import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecallAlertBanner } from '@/components/pharmacy/RecallAlertBanner'

describe('RecallAlertBanner', () => {
  it('renders nothing when there are no alerts', () => {
    const { container } = render(<RecallAlertBanner alerts={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a prominent banner listing each recall', () => {
    render(<RecallAlertBanner alerts={[{ recallId: 'r1', description: 'Contamination recall', initiationDate: '2026-01-01', status: 'ongoing' }]} />)
    const banner = screen.getByTestId('recall-banner')
    expect(banner).toHaveAttribute('role', 'alert')
    expect(banner.textContent).toContain('Contamination recall')
  })
})
