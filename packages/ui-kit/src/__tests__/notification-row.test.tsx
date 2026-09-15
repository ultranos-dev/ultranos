import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FlaskConical } from '../icons'
import { NotificationRow } from '../components/ui/notification-row'

describe('NotificationRow', () => {
  it('shows app name (muted micro-label) and subject on one line, plus timestamp data-slot; right container pinned inline-end via ms-auto', () => {
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Lab order received"
      body="Hemoglobin · Central Lab" notes="Sample is being processed." timeAgo="2h ago" />)
    expect(screen.getByText('Lab Lite')).toBeInTheDocument()
    expect(screen.getByText('Lab order received')).toBeInTheDocument()
    const time = screen.getByText('2h ago')
    expect(time).toHaveAttribute('data-slot', 'notification-time')
    // Right container (dot + timestamp) is pinned to inline-end
    const rightContainer = time.parentElement
    expect(rightContainer).toHaveClass('ms-auto')
  })

  it('does NOT render body text even when body prop is passed', () => {
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Lab order received"
      body="Hemoglobin · Central Lab" notes="Sample is being processed." timeAgo="2h ago" />)
    expect(screen.queryByText('Hemoglobin · Central Lab')).not.toBeInTheDocument()
  })

  it('does NOT render notes text even when notes prop is passed', () => {
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Lab order received"
      body="Hemoglobin · Central Lab" notes="Sample is being processed." timeAgo="2h ago" />)
    expect(screen.queryByText('Sample is being processed.')).not.toBeInTheDocument()
  })

  it('renders app name with muted, small, medium-weight styling', () => {
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="New result"
      timeAgo="1h ago" />)
    const appName = screen.getByText('Lab Lite')
    expect(appName).toHaveClass('text-muted-foreground')
    expect(appName).toHaveClass('text-xs')
  })

  it('renders subject with foreground styling (normal state)', () => {
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="New result"
      timeAgo="1h ago" />)
    const subject = screen.getByText('New result')
    expect(subject).toHaveClass('text-foreground')
  })

  it('renders app name, subject and time in BOLD when unread', () => {
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Lab order received"
      timeAgo="14h ago" unread />)
    expect(screen.getByText('Lab Lite')).toHaveClass('font-bold')
    expect(screen.getByText('Lab order received')).toHaveClass('font-bold')
    expect(screen.getByText('14h ago')).toHaveClass('font-bold')
  })

  it('renders app name, subject and time in NORMAL weight when read', () => {
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Lab order received"
      timeAgo="14h ago" unread={false} />)
    expect(screen.getByText('Lab Lite')).toHaveClass('font-normal')
    expect(screen.getByText('Lab order received')).toHaveClass('font-normal')
    expect(screen.getByText('14h ago')).toHaveClass('font-normal')
    expect(screen.getByText('Lab Lite')).not.toHaveClass('font-bold')
  })

  it('toggle shows a FILLED bell when unread', () => {
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="s" timeAgo="1h" unread
      onToggleRead={vi.fn()} markReadLabel="Mark as read" markUnreadLabel="Mark as unread" />)
    const svg = screen.getByRole('button', { name: 'Mark as read' }).querySelector('svg')
    expect(svg).toHaveAttribute('fill', 'currentColor')
  })

  it('toggle shows an OUTLINE bell (not filled) when read', () => {
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="s" timeAgo="1h" unread={false}
      onToggleRead={vi.fn()} markReadLabel="Mark as read" markUnreadLabel="Mark as unread" />)
    const svg = screen.getByRole('button', { name: 'Mark as unread' }).querySelector('svg')
    expect(svg).not.toHaveAttribute('fill', 'currentColor')
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

  // ─── Delete button ──────────────────────────────────────────────────────────

  it('renders delete button when onDelete is provided', () => {
    const onDelete = vi.fn()
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Test"
      timeAgo="1h ago" onDelete={onDelete} deleteLabel="Delete notification" />)
    expect(screen.getByRole('button', { name: 'Delete notification' })).toBeInTheDocument()
  })

  it('does not render delete button when onDelete is not provided', () => {
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Test"
      timeAgo="1h ago" deleteLabel="Delete notification" />)
    expect(screen.queryByRole('button', { name: 'Delete notification' })).not.toBeInTheDocument()
  })

  it('clicking delete button calls onDelete and does NOT call row onClick (stopPropagation)', () => {
    const onDelete = vi.fn()
    const onRowClick = vi.fn()
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Test"
      timeAgo="1h ago" onDelete={onDelete} deleteLabel="Delete notification" onClick={onRowClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete notification' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onRowClick).not.toHaveBeenCalled()
  })

  // ─── Toggle read/unread button ──────────────────────────────────────────────

  it('when unread=true and onToggleRead given: toggle button is present with markReadLabel', () => {
    const onToggleRead = vi.fn()
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Test"
      timeAgo="1h ago" onToggleRead={onToggleRead} unread={true}
      markReadLabel="Mark as read" markUnreadLabel="Mark as unread" />)
    expect(screen.getByRole('button', { name: 'Mark as read' })).toBeInTheDocument()
  })

  it('when unread=true, clicking toggle button calls onToggleRead and NOT row onClick', () => {
    const onToggleRead = vi.fn()
    const onRowClick = vi.fn()
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Test"
      timeAgo="1h ago" onToggleRead={onToggleRead} unread={true}
      markReadLabel="Mark as read" markUnreadLabel="Mark as unread" onClick={onRowClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }))
    expect(onToggleRead).toHaveBeenCalledTimes(1)
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('when unread=false (already read) and onToggleRead given: toggle button is STILL present with markUnreadLabel', () => {
    const onToggleRead = vi.fn()
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Test"
      timeAgo="1h ago" onToggleRead={onToggleRead} unread={false}
      markReadLabel="Mark as read" markUnreadLabel="Mark as unread" />)
    expect(screen.getByRole('button', { name: 'Mark as unread' })).toBeInTheDocument()
  })

  it('when unread=false, clicking toggle button calls onToggleRead and NOT row onClick', () => {
    const onToggleRead = vi.fn()
    const onRowClick = vi.fn()
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Test"
      timeAgo="1h ago" onToggleRead={onToggleRead} unread={false}
      markReadLabel="Mark as read" markUnreadLabel="Mark as unread" onClick={onRowClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark as unread' }))
    expect(onToggleRead).toHaveBeenCalledTimes(1)
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('toggle button is absent when onToggleRead is not provided', () => {
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Test"
      timeAgo="1h ago" unread={true}
      markReadLabel="Mark as read" markUnreadLabel="Mark as unread" />)
    expect(screen.queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as unread' })).not.toBeInTheDocument()
  })

  // ─── Row body click still fires ─────────────────────────────────────────────

  it('row body click (not an action button) still fires row onClick', () => {
    const onRowClick = vi.fn()
    const onDelete = vi.fn()
    const onToggleRead = vi.fn()
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Test"
      timeAgo="1h ago" onClick={onRowClick} onDelete={onDelete} deleteLabel="Delete notification"
      onToggleRead={onToggleRead} unread={true} markReadLabel="Mark as read" markUnreadLabel="Mark as unread" />)
    // Click the subject text (part of the row body, not a button)
    fireEvent.click(screen.getByText('Test'))
    expect(onRowClick).toHaveBeenCalledTimes(1)
  })
})
