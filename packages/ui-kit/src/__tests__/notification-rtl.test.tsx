import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Bell } from '../icons'
import { NotificationRow } from '../components/ui/notification-row'
import { NotificationDetailModal } from '../components/ui/notification-detail-modal'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderInDir(dir: 'ltr' | 'rtl', ui: React.ReactElement) {
  return render(<div dir={dir}>{ui}</div>)
}

// ---------------------------------------------------------------------------
// NotificationRow RTL tests
// ---------------------------------------------------------------------------

describe('NotificationRow — RTL/LTR safety', () => {
  const baseProps = {
    icon: Bell,
    appName: 'OPD Lite',
    subject: 'Patient check-in',
    timeAgo: '5m ago',
  }

  describe('LTR rendering', () => {
    it('renders without crash and shows required content in LTR', () => {
      renderInDir('ltr', <NotificationRow {...baseProps} />)
      expect(screen.getByText('OPD Lite')).toBeInTheDocument()
      expect(screen.getByText('Patient check-in')).toBeInTheDocument()
      expect(screen.getByText('5m ago')).toBeInTheDocument()
    })

    it('snapshot — LTR', () => {
      const { container } = renderInDir('ltr', <NotificationRow {...baseProps} />)
      expect(container.firstChild).toMatchSnapshot()
    })

    it('timestamp uses ms-auto (logical inline-end) in LTR', () => {
      const { container } = renderInDir('ltr', <NotificationRow {...baseProps} />)
      const timeEl = container.querySelector('[data-slot="notification-time"]')
      expect(timeEl).not.toBeNull()
      expect(timeEl!.className).toContain('ms-auto')
    })

    it('icon wrapper (DirectionalIcon medical) has NO transform style in LTR', () => {
      const { container } = renderInDir('ltr', <NotificationRow {...baseProps} />)
      // The icon is wrapped in DirectionalIcon category="medical"
      // Medical icons must NEVER have the transform CSS variable applied
      const iconWrapper = container.querySelector('span[aria-hidden="true"]')
      expect(iconWrapper).not.toBeNull()
      expect(iconWrapper!.getAttribute('style') ?? '').not.toContain('transform')
    })
  })

  describe('RTL rendering', () => {
    it('renders without crash and shows required content in RTL', () => {
      renderInDir('rtl', <NotificationRow {...baseProps} />)
      expect(screen.getByText('OPD Lite')).toBeInTheDocument()
      expect(screen.getByText('Patient check-in')).toBeInTheDocument()
      expect(screen.getByText('5m ago')).toBeInTheDocument()
    })

    it('snapshot — RTL', () => {
      const { container } = renderInDir('rtl', <NotificationRow {...baseProps} />)
      expect(container.firstChild).toMatchSnapshot()
    })

    it('timestamp uses ms-auto (logical inline-end) in RTL', () => {
      const { container } = renderInDir('rtl', <NotificationRow {...baseProps} />)
      const timeEl = container.querySelector('[data-slot="notification-time"]')
      expect(timeEl).not.toBeNull()
      expect(timeEl!.className).toContain('ms-auto')
    })

    it('icon wrapper (DirectionalIcon medical) has NO transform style in RTL — never mirrors', () => {
      const { container } = renderInDir('rtl', <NotificationRow {...baseProps} />)
      // Medical icons must NOT mirror even under a dir="rtl" ancestor.
      // DirectionalIcon only applies transform for category="navigation".
      // Assert the span's style does NOT contain the transform CSS variable.
      const iconWrapper = container.querySelector('span[aria-hidden="true"]')
      expect(iconWrapper).not.toBeNull()
      expect(iconWrapper!.getAttribute('style') ?? '').not.toContain('transform')
    })
  })
})

// ---------------------------------------------------------------------------
// NotificationDetailModal RTL tests
// ---------------------------------------------------------------------------

describe('NotificationDetailModal — RTL/LTR safety', () => {
  const baseProps = {
    open: true as const,
    onOpenChange: vi.fn(),
    icon: Bell,
    appName: 'OPD Lite',
    subject: 'Appointment confirmed',
    exactTimestamp: '15 Sep 2026, 09:00',
  }

  describe('LTR rendering', () => {
    it('renders subject and timestamp without crash in LTR', () => {
      renderInDir('ltr', <NotificationDetailModal {...baseProps} />)
      // No body prop → subject appears twice: in DialogTitle + sr-only DialogDescription
      expect(screen.getAllByText('Appointment confirmed')).toHaveLength(2)
      expect(screen.getByText('15 Sep 2026, 09:00')).toBeInTheDocument()
    })

    it('snapshot — LTR open modal', () => {
      const { container } = renderInDir('ltr', <NotificationDetailModal {...baseProps} />)
      expect(container.firstChild).toMatchSnapshot()
    })
  })

  describe('RTL rendering', () => {
    it('renders subject and timestamp without crash in RTL', () => {
      renderInDir('rtl', <NotificationDetailModal {...baseProps} />)
      // No body prop → subject appears twice: in DialogTitle + sr-only DialogDescription
      expect(screen.getAllByText('Appointment confirmed')).toHaveLength(2)
      expect(screen.getByText('15 Sep 2026, 09:00')).toBeInTheDocument()
    })

    it('snapshot — RTL open modal', () => {
      const { container } = renderInDir('rtl', <NotificationDetailModal {...baseProps} />)
      expect(container.firstChild).toMatchSnapshot()
    })

    it('renders details list inside dir="rtl" wrapper without crash (logical layout)', () => {
      renderInDir(
        'rtl',
        <NotificationDetailModal
          {...baseProps}
          details={[
            { label: 'Order ID', value: '5A4741' },
            { label: 'Status', value: 'Pending', emphasis: true },
          ]}
          patient={{ label: 'Patient', value: 'Ahmad K.' }}
        />,
      )
      expect(screen.getByText('Order ID')).toBeInTheDocument()
      expect(screen.getByText('5A4741')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()
      expect(screen.getByText('Pending')).toBeInTheDocument()
      expect(screen.getByText('Ahmad K.')).toBeInTheDocument()
      // Assert the emphasis: true field carries text-destructive class
      const statusLabel = screen.getByText('Status').closest('dt')
      const statusValue = statusLabel?.nextElementSibling as HTMLElement | null
      expect(statusValue).not.toBeNull()
      expect(statusValue?.className).toContain('text-destructive')
      expect(statusValue).toHaveTextContent('Pending')
    })
  })
})
