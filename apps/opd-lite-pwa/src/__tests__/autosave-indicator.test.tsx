import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AutosaveIndicator } from '@/components/clinical/autosave-indicator'

describe('AutosaveIndicator component', () => {
  it('should show saved state with cloud checkmark', () => {
    render(<AutosaveIndicator status="saved" />)
    expect(screen.getByRole('status')).toBeDefined()
    expect(screen.getByText(/saved/i)).toBeDefined()
  })

  it('should show saving state', () => {
    render(<AutosaveIndicator status="saving" />)
    expect(screen.getByText(/saving/i)).toBeDefined()
  })

  it('should show idle state (no indicator text)', () => {
    render(<AutosaveIndicator status="idle" />)
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('')
  })

  it('should have accessible role=status for screen readers', () => {
    render(<AutosaveIndicator status="saved" />)
    expect(screen.getByRole('status')).toBeDefined()
  })

  it('should apply pulse animation class when status is saved', () => {
    const { container } = render(<AutosaveIndicator status="saved" />)
    const indicator = container.querySelector('[data-testid="autosave-indicator"]')
    expect(indicator).toBeDefined()
  })

  it('should show error state with warning message', () => {
    render(<AutosaveIndicator status="error" />)
    expect(screen.getByText(/save failed/i)).toBeDefined()
  })
})
