/**
 * Story 54.2 — CHWModeGate Component Tests (Task 14.6)
 *
 * Integration test: CHW mode gate completely removes restricted UI sections
 * from the component tree (not just hidden with CSS) — AC #8.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CHWModeGate } from '@/components/chw/CHWModeGate'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseIsCHWMode = vi.fn()

vi.mock('@/lib/chw-mode', () => ({
  useIsCHWMode: () => mockUseIsCHWMode(),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CHWModeGate', () => {
  it('renders CHW content when in CHW mode', () => {
    mockUseIsCHWMode.mockReturnValue(true)
    render(
      <CHWModeGate
        chw={<div data-testid="chw-content">CHW UI</div>}
        standard={<div data-testid="standard-content">Standard UI</div>}
      />,
    )
    expect(screen.getByTestId('chw-content')).toBeInTheDocument()
    expect(screen.queryByTestId('standard-content')).not.toBeInTheDocument()
  })

  it('renders standard content when not in CHW mode', () => {
    mockUseIsCHWMode.mockReturnValue(false)
    render(
      <CHWModeGate
        chw={<div data-testid="chw-content">CHW UI</div>}
        standard={<div data-testid="standard-content">Standard UI</div>}
      />,
    )
    expect(screen.getByTestId('standard-content')).toBeInTheDocument()
    expect(screen.queryByTestId('chw-content')).not.toBeInTheDocument()
  })

  it('does NOT hide content with CSS — the inactive branch is completely absent from DOM', () => {
    mockUseIsCHWMode.mockReturnValue(true)
    const { container } = render(
      <CHWModeGate
        chw={<div data-testid="chw-content">CHW UI</div>}
        standard={<div data-testid="standard-content">Standard UI</div>}
      />,
    )
    // Standard content should not exist at all in the DOM
    expect(container.innerHTML).not.toContain('standard-content')
    expect(container.innerHTML).not.toContain('Standard UI')
  })
})
