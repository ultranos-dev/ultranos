import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
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
})
