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
})
