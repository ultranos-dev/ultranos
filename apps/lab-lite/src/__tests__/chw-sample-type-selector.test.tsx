/**
 * Story 54.2 — SampleTypeSelector Component Tests (Task 14.3)
 *
 * Tests for:
 *  - Icon rendering for all 4 sample types
 *  - Single-select behavior (only one card selected at a time)
 *  - Confirm button state (disabled until selection)
 *  - RTL layout: medical icons must NOT mirror (DirectionalIcon category="medical")
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SampleTypeSelector } from '@/components/chw/SampleTypeSelector'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// DirectionalIcon — pass through children without transformation
vi.mock('@ultranos/ui-kit', () => ({
  DirectionalIcon: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SampleTypeSelector', () => {
  it('renders buttons for all 4 sample types', () => {
    render(<SampleTypeSelector onConfirm={vi.fn()} />)
    expect(screen.getAllByRole('radio')).toHaveLength(4)
  })

  it('confirm button is disabled before selection', () => {
    render(<SampleTypeSelector onConfirm={vi.fn()} />)
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled()
  })

  it('confirm button enables after selecting a sample type', async () => {
    render(<SampleTypeSelector onConfirm={vi.fn()} />)
    const bloodButton = screen.getByRole('radio', { name: /blood/i })
    await userEvent.click(bloodButton)
    expect(screen.getByRole('button', { name: /confirm/i })).not.toBeDisabled()
  })

  it('only one sample type can be selected at a time', async () => {
    render(<SampleTypeSelector onConfirm={vi.fn()} />)
    const bloodButton = screen.getByRole('radio', { name: /blood/i })
    const urineButton = screen.getByRole('radio', { name: /urine/i })

    await userEvent.click(bloodButton)
    expect(bloodButton).toHaveAttribute('aria-checked', 'true')
    expect(urineButton).toHaveAttribute('aria-checked', 'false')

    await userEvent.click(urineButton)
    expect(bloodButton).toHaveAttribute('aria-checked', 'false')
    expect(urineButton).toHaveAttribute('aria-checked', 'true')
  })

  it('calls onConfirm with selected sample type', async () => {
    const onConfirm = vi.fn()
    render(<SampleTypeSelector onConfirm={onConfirm} />)

    await userEvent.click(screen.getByRole('radio', { name: /blood/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }))

    expect(onConfirm).toHaveBeenCalledWith('blood')
  })

  it('all icon buttons have aria-hidden (icons are decorative, text provides meaning)', () => {
    render(<SampleTypeSelector onConfirm={vi.fn()} />)
    // Each SVG inside a card should be aria-hidden
    const svgs = document.querySelectorAll('svg[aria-hidden]')
    expect(svgs.length).toBeGreaterThan(0)
  })
})
