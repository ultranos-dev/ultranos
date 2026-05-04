import { render, screen, fireEvent } from '@testing-library/react'
import { SessionWarningToast } from '../SessionWarningToast.js'
import type { SessionWarningToastProps } from '../SessionWarningToast.js'

function renderToast(overrides: Partial<SessionWarningToastProps> = {}) {
  const props: SessionWarningToastProps = {
    remainingSeconds: 300,
    onStaySignedIn: vi.fn(),
    ...overrides,
  }
  return { ...render(<SessionWarningToast {...props} />), props }
}

describe('SessionWarningToast', () => {
  it('renders countdown text with minutes', () => {
    renderToast({ remainingSeconds: 180 })
    expect(screen.getByRole('alert')).toHaveTextContent('Session expiring in 3 minutes')
  })

  it('shows seconds when less than 1 minute', () => {
    renderToast({ remainingSeconds: 45 })
    expect(screen.getByRole('alert')).toHaveTextContent('Session expiring in 45 seconds')
  })

  it('shows minutes and seconds for non-round values', () => {
    renderToast({ remainingSeconds: 125 })
    expect(screen.getByRole('alert')).toHaveTextContent('Session expiring in 2m 5s')
  })

  it('has role="alert" for accessibility', () => {
    renderToast()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('has aria-live="polite"', () => {
    renderToast()
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite')
  })

  it('"Stay signed in" button calls onStaySignedIn', () => {
    const onStaySignedIn = vi.fn()
    renderToast({ onStaySignedIn })

    fireEvent.click(screen.getByRole('button', { name: /stay signed in/i }))
    expect(onStaySignedIn).toHaveBeenCalledTimes(1)
  })
})
