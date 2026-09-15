import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FlaskConical } from '../icons'
import { NotificationRow } from '../components/ui/notification-row'

describe('NotificationRow', () => {
  it('shows app name as title, subject, body, notes and time in the top-right', () => {
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Lab order received"
      body="Hemoglobin · Central Lab" notes="Sample is being processed." timeAgo="2h ago" />)
    expect(screen.getByText('Lab Lite')).toBeInTheDocument()
    expect(screen.getByText('Lab order received')).toBeInTheDocument()
    expect(screen.getByText('Hemoglobin · Central Lab')).toBeInTheDocument()
    expect(screen.getByText('Sample is being processed.')).toBeInTheDocument()
    const time = screen.getByText('2h ago')
    expect(time).toHaveAttribute('data-slot', 'notification-time')
  })

  it('renders unread dot when unread is true with provided unreadLabel', () => {
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="New result"
      timeAgo="1h ago" unread={true} unreadLabel="Unread notification" />)
    const unreadDot = screen.getByLabelText('Unread notification')
    expect(unreadDot).toBeInTheDocument()
    expect(unreadDot).toHaveClass('bg-primary')
  })

  it('renders unread dot as aria-hidden when unread is true but unreadLabel is omitted', () => {
    const { container } = render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="New result"
      timeAgo="1h ago" unread={true} />)
    const unreadDot = container.querySelector('.bg-primary')
    expect(unreadDot).toBeInTheDocument()
    expect(unreadDot).toHaveAttribute('aria-hidden', 'true')
  })

  it('does not render unread dot when unread is false', () => {
    const { container } = render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="New result"
      timeAgo="1h ago" unread={false} />)
    const unreadDot = container.querySelector('.bg-primary')
    expect(unreadDot).not.toBeInTheDocument()
  })

  it('applies destructive styling to appName when urgent is true', () => {
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Critical result"
      timeAgo="1h ago" urgent={true} />)
    const appName = screen.getByText('Lab Lite')
    expect(appName).toHaveClass('text-destructive')
  })

  it('applies destructive styling to subject when urgent is true', () => {
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Critical result"
      timeAgo="1h ago" urgent={true} />)
    const subject = screen.getByText('Critical result')
    expect(subject).toHaveClass('text-destructive')
  })

  it('applies ring styling to container when urgent is true', () => {
    const { container } = render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Critical result"
      timeAgo="1h ago" urgent={true} />)
    const button = container.firstChild
    expect(button).toHaveClass('ring-1')
    expect(button).toHaveClass('ring-destructive/40')
  })

  it('calls onClick and prevents default when Enter key is pressed', () => {
    const onClick = vi.fn()
    const { container } = render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Test"
      timeAgo="1h ago" onClick={onClick} />)
    const button = container.firstChild as HTMLElement
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
    button.dispatchEvent(event)
    expect(preventDefaultSpy).toHaveBeenCalled()
    expect(onClick).toHaveBeenCalled()
  })

  it('calls onClick and prevents default when Space key is pressed', () => {
    const onClick = vi.fn()
    const { container } = render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Test"
      timeAgo="1h ago" onClick={onClick} />)
    const button = container.firstChild as HTMLElement
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true })
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
    button.dispatchEvent(event)
    expect(preventDefaultSpy).toHaveBeenCalled()
    expect(onClick).toHaveBeenCalled()
  })

  it('does not call onClick for other keys', () => {
    const onClick = vi.fn()
    const { container } = render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Test"
      timeAgo="1h ago" onClick={onClick} />)
    const button = container.firstChild as HTMLElement
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
    button.dispatchEvent(event)
    expect(onClick).not.toHaveBeenCalled()
  })
})
