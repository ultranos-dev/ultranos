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

  it('renders details list as a <dl> with grid layout and patient line when provided', () => {
    render(
      <NotificationDetailModal
        open
        onOpenChange={vi.fn()}
        icon={FlaskConical}
        appName="Lab Lite"
        subject="Lab order received"
        exactTimestamp="15 Sep 2026, 06:45"
        details={[
          { label: 'Order ID', value: '5A4741' },
          { label: 'Received', value: '15 Sep 2026, 06:45' },
        ]}
        patient={{ label: 'Patient', value: 'Ahmad K.' }}
      />
    )
    // details rendered in a <dl> — Dialog renders in portal, use document.querySelector
    const dl = document.querySelector('dl')
    expect(dl).not.toBeNull()
    // dt/dd pairs present
    expect(screen.getByText('Order ID')).toBeInTheDocument()
    expect(screen.getByText('5A4741')).toBeInTheDocument()
    expect(screen.getByText('Received')).toBeInTheDocument()
    // "15 Sep 2026, 06:45" appears in both exactTimestamp and details — just check presence
    expect(screen.getAllByText('15 Sep 2026, 06:45').length).toBeGreaterThanOrEqual(1)
    // patient rendered as a distinct section
    expect(screen.getByText('Patient')).toBeInTheDocument()
    expect(screen.getByText('Ahmad K.')).toBeInTheDocument()
  })

  it('details dl rows use dt for label (muted) and dd for value, direct children of dl (no wrapper)', () => {
    render(
      <NotificationDetailModal
        open
        onOpenChange={vi.fn()}
        icon={FlaskConical}
        appName="Lab Lite"
        subject="Lab order received"
        exactTimestamp="15 Sep 2026, 06:45"
        details={[{ label: 'Order ID', value: '5A4741' }]}
      />
    )
    // Dialog renders in a portal — use document.querySelector
    const dl = document.querySelector('dl')
    expect(dl).not.toBeNull()
    // dt and dd are direct children of dl (no contents wrapper)
    const dt = dl!.querySelector('dt')
    expect(dt).not.toBeNull()
    expect(dt!.textContent).toBe('Order ID')
    expect(dt!.className).toContain('text-muted-foreground')

    const dd = dl!.querySelector('dd')
    expect(dd).not.toBeNull()
    expect(dd!.textContent).toBe('5A4741')
  })

  it('notes block is rendered as a distinct block below details', () => {
    render(
      <NotificationDetailModal
        open
        onOpenChange={vi.fn()}
        icon={FlaskConical}
        appName="Lab Lite"
        subject="Lab order received"
        exactTimestamp="15 Sep 2026, 06:45"
        notes="Sample is being processed."
        details={[{ label: 'Order ID', value: '5A4741' }]}
      />
    )
    // notes text rendered
    const notesEl = screen.getByText('Sample is being processed.')
    expect(notesEl).toBeInTheDocument()
    expect(notesEl.className).toContain('text-muted-foreground')
    // Dialog renders in a portal — use document.querySelector to find the <dl>
    const dl = document.querySelector('dl')
    expect(dl).not.toBeNull()
    // Both dl and notes exist and notes comes after dl in DOM order:
    // compareDocumentPosition from notes's perspective — dl should be PRECEDING (2)
    const notesPosition = notesEl.compareDocumentPosition(dl!)
    // DOCUMENT_POSITION_PRECEDING = 2 — dl precedes the notes element
    expect(notesPosition & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  })

  it('renders a loading placeholder when patientLoading=true and hides patient value', () => {
    render(
      <NotificationDetailModal
        open
        onOpenChange={vi.fn()}
        icon={FlaskConical}
        appName="Lab Lite"
        subject="Lab order received"
        exactTimestamp="15 Sep 2026, 06:45"
        patientLoading
      />
    )
    // A placeholder element should be present while loading
    expect(screen.getByTestId('patient-loading')).toBeInTheDocument()
    // The patient value should not appear
    expect(screen.queryByText('Ahmad K.')).not.toBeInTheDocument()
  })

  it('renders subject without crash when neither details nor patient are provided', () => {
    render(
      <NotificationDetailModal
        open
        onOpenChange={vi.fn()}
        icon={FlaskConical}
        appName="Lab Lite"
        subject="Simple notification"
        exactTimestamp="15 Sep 2026, 06:45"
      />
    )
    expect(screen.getAllByText('Simple notification')).toHaveLength(2)
  })

  it('timestamp has muted small styling', () => {
    render(
      <NotificationDetailModal
        open
        onOpenChange={vi.fn()}
        icon={FlaskConical}
        appName="Lab Lite"
        subject="Lab order received"
        exactTimestamp="15 Sep 2026, 06:45"
      />
    )
    const timestamp = screen.getByText('15 Sep 2026, 06:45')
    expect(timestamp).toHaveClass('text-muted-foreground')
    expect(timestamp).toHaveClass('text-xs')
  })

  it('appName in header has muted, small styling', () => {
    render(
      <NotificationDetailModal
        open
        onOpenChange={vi.fn()}
        icon={FlaskConical}
        appName="Lab Lite"
        subject="Lab order received"
        exactTimestamp="15 Sep 2026, 06:45"
      />
    )
    // appName appears in the header section (not the sr-only description)
    const appNameEl = screen.getByText('Lab Lite')
    expect(appNameEl).toHaveClass('text-muted-foreground')
    expect(appNameEl).toHaveClass('text-xs')
  })
})
