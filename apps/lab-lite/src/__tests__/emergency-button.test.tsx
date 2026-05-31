/**
 * Component tests for EmergencyButton and EmergencyActionMenu
 * Story 47.1 — Task 12.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, args?: Record<string, unknown>) => {
    const msgs: Record<string, string> = {
      buttonAriaLabel: 'Emergency Protocol',
      buttonLabel: 'Emergency',
      menuTitle: 'Select Exposure Type',
      menuSubtitle: 'What happened?',
      cancel: 'Cancel',
      'exposureTypes.needlestick': 'Needlestick / Sharps',
      'exposureTypes.splashMucous': 'Splash — Mucous Membrane',
      'exposureTypes.splashBrokenSkin': 'Splash — Broken Skin',
      'exposureTypes.spill': 'Chemical / Biological Spill',
    }
    if (key in msgs) return msgs[key]
    // Interpolate simple {key} patterns for step counter etc.
    let msg = key
    if (args) {
      for (const [k, v] of Object.entries(args)) {
        msg = msg.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return msg
  },
}))

// ExposureWorkflow is a heavy component — mock it to isolate EmergencyButton tests
vi.mock('@/components/safety/ExposureWorkflow', () => ({
  ExposureWorkflow: ({ onClose, exposureType }: { onClose: () => void; exposureType: string }) => (
    <div data-testid="mock-workflow" data-exposure-type={exposureType}>
      <button onClick={onClose}>Close Workflow</button>
    </div>
  ),
}))

import { EmergencyButton } from '../components/safety/EmergencyButton'
import { EmergencyActionMenu } from '../components/safety/EmergencyActionMenu'

// ---------------------------------------------------------------------------
// EmergencyButton
// ---------------------------------------------------------------------------

describe('EmergencyButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.dir = 'ltr'
  })

  it('renders the emergency button', () => {
    render(<EmergencyButton />)
    const btn = screen.getByRole('button', { name: /emergency protocol/i })
    expect(btn).toBeInTheDocument()
  })

  it('button has fixed positioning style', () => {
    render(<EmergencyButton />)
    const btn = screen.getByRole('button', { name: /emergency protocol/i })
    expect(btn).toHaveStyle({ position: 'fixed' })
  })

  it('button has minimum 56px touch target size', () => {
    render(<EmergencyButton />)
    const btn = screen.getByRole('button', { name: /emergency protocol/i })
    expect(btn).toHaveStyle({ width: '56px', height: '56px' })
  })

  it('button has red background color', () => {
    render(<EmergencyButton />)
    const btn = screen.getByRole('button', { name: /emergency protocol/i })
    expect(btn).toHaveStyle({ backgroundColor: '#dc2626' })
  })

  it('button uses insetInlineEnd for RTL-compatible positioning', () => {
    render(<EmergencyButton />)
    const btn = screen.getByRole('button', { name: /emergency protocol/i })
    // insetInlineEnd is the logical property — jsdom normalizes to inline style
    expect(btn.style.insetInlineEnd).toBe('1rem')
  })

  it('emergency action menu is NOT shown on initial render', () => {
    render(<EmergencyButton />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('clicking the button opens the emergency action menu', () => {
    render(<EmergencyButton />)
    const btn = screen.getByRole('button', { name: /emergency protocol/i })
    fireEvent.click(btn)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('clicking cancel in the menu closes it', () => {
    render(<EmergencyButton />)
    fireEvent.click(screen.getByRole('button', { name: /emergency protocol/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('LTR snapshot', () => {
    document.dir = 'ltr'
    const { container } = render(<EmergencyButton />)
    expect(container).toMatchSnapshot()
  })

  it('RTL snapshot — button stays in inline-end position', () => {
    document.dir = 'rtl'
    const { container } = render(<EmergencyButton />)
    expect(container).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// EmergencyActionMenu
// ---------------------------------------------------------------------------

describe('EmergencyActionMenu', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders as a dialog with aria-modal', () => {
    render(<EmergencyActionMenu onClose={onClose} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('renders the menu title', () => {
    render(<EmergencyActionMenu onClose={onClose} />)
    expect(screen.getByText('Select Exposure Type')).toBeInTheDocument()
  })

  it('renders all three exposure type buttons', () => {
    render(<EmergencyActionMenu onClose={onClose} />)
    expect(screen.getByText('Needlestick / Sharps')).toBeInTheDocument()
    expect(screen.getByText('Splash — Mucous Membrane')).toBeInTheDocument()
    expect(screen.getByText('Splash — Broken Skin')).toBeInTheDocument()
  })

  it('renders the spill button', () => {
    render(<EmergencyActionMenu onClose={onClose} />)
    expect(screen.getByText('Chemical / Biological Spill')).toBeInTheDocument()
  })

  it('renders the cancel button', () => {
    render(<EmergencyActionMenu onClose={onClose} />)
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('exposure type buttons have minimum 64px touch target', () => {
    render(<EmergencyActionMenu onClose={onClose} />)
    const needlestickBtn = screen.getByText('Needlestick / Sharps')
    expect(needlestickBtn).toHaveStyle({ minHeight: '64px' })
  })

  it('clicking cancel calls onClose', () => {
    render(<EmergencyActionMenu onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicking spill button calls onClose (stub navigation)', () => {
    render(<EmergencyActionMenu onClose={onClose} />)
    fireEvent.click(screen.getByText('Chemical / Biological Spill'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('selecting needlestick exposure opens ExposureWorkflow', () => {
    render(<EmergencyActionMenu onClose={onClose} />)
    fireEvent.click(screen.getByText('Needlestick / Sharps'))
    expect(screen.getByTestId('mock-workflow')).toBeInTheDocument()
    expect(screen.getByTestId('mock-workflow')).toHaveAttribute('data-exposure-type', 'NEEDLESTICK')
  })

  it('selecting splash_mucous exposure opens ExposureWorkflow with correct type', () => {
    render(<EmergencyActionMenu onClose={onClose} />)
    fireEvent.click(screen.getByText('Splash — Mucous Membrane'))
    expect(screen.getByTestId('mock-workflow')).toHaveAttribute('data-exposure-type', 'SPLASH_MUCOUS')
  })

  it('selecting splash_broken_skin exposure opens ExposureWorkflow with correct type', () => {
    render(<EmergencyActionMenu onClose={onClose} />)
    fireEvent.click(screen.getByText('Splash — Broken Skin'))
    expect(screen.getByTestId('mock-workflow')).toHaveAttribute('data-exposure-type', 'SPLASH_BROKEN_SKIN')
  })

  it('after selecting exposure, exposure type buttons are no longer shown', () => {
    render(<EmergencyActionMenu onClose={onClose} />)
    fireEvent.click(screen.getByText('Needlestick / Sharps'))
    expect(screen.queryByText('Needlestick / Sharps')).not.toBeInTheDocument()
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument()
  })
})
