import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Alert } from '../components/ui/alert.js'

describe('Alert', () => {
  it('renders children and a title', () => {
    render(<Alert variant="warning" title="Heads up">body</Alert>)
    expect(screen.getByText('Heads up')).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
  })
  it('uses destructive tokens for destructive variant', () => {
    const { container } = render(<Alert variant="destructive">x</Alert>)
    expect(container.firstChild).toHaveClass('border-destructive/30')
  })
  it('supports role=alert for safety-critical messages', () => {
    render(<Alert variant="destructive" role="alert">blocked</Alert>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
  it('forwards className and extra HTML attributes', () => {
    const { container } = render(
      <Alert variant="info" className="extra" data-testid="a">x</Alert>,
    )
    expect(container.firstChild).toHaveClass('extra')
    expect(screen.getByTestId('a')).toBeInTheDocument()
  })
})
