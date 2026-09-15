import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FlaskConical } from '../icons'
import { NotificationDetailModal } from '../components/ui/notification-detail-modal'

describe('NotificationDetailModal', () => {
  it('renders content when open', () => {
    render(<NotificationDetailModal open onOpenChange={vi.fn()} icon={FlaskConical}
      appName="Lab Lite" subject="Lab order received" body="Hemoglobin · Central Lab"
      notes="Sample is being processed." exactTimestamp="15 Sep 2026, 06:45"
      action={{ label: 'View order', onClick: vi.fn() }} />)
    expect(screen.getByText('Lab order received')).toBeInTheDocument()
    expect(screen.getByText('15 Sep 2026, 06:45')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View order' })).toBeInTheDocument()
  })

  it('renders correctly without a body — DialogDescription auto-wired with sr-only subject', () => {
    // When body is absent, a sr-only DialogDescription containing the subject ensures
    // Radix properly associates the accessible description. The subject appears in the title
    // and again (invisibly) in the sr-only description.
    render(<NotificationDetailModal open onOpenChange={vi.fn()} icon={FlaskConical}
      appName="System" subject="Sync conflict detected"
      exactTimestamp="15 Sep 2026, 08:00" />)
    expect(screen.getAllByText('Sync conflict detected')).toHaveLength(2)
    expect(screen.getByText('15 Sep 2026, 08:00')).toBeInTheDocument()
    // No body text rendered
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    // No action button when not provided
    expect(screen.queryByRole('button', { name: /view/i })).not.toBeInTheDocument()
  })
})
