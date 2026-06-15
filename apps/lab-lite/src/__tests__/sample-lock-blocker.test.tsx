/**
 * sample-lock-blocker.test.tsx — Story 51.3: Sample Collision Prevention
 *
 * Tests the SampleLockBlocker dialog: renders, request release flow, dismiss.
 * PHI rule: no patient data used in assertions. lockedByName is a tech name only.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SampleLockBlocker } from '../components/samples/SampleLockBlocker'

// Minimal i18n mock — returns key, appending any param values so assertions can match them
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (!params) return key
    return `${key} ${Object.values(params).join(' ')}`
  },
}))

const LOCKED_AT = new Date(Date.now() - 30 * 60_000).toISOString() // 30 min ago

function renderBlocker(overrides: Partial<React.ComponentProps<typeof SampleLockBlocker>> = {}) {
  const props = {
    lockedByName: 'Ahmad Karimi',
    lockedAt: LOCKED_AT,
    onDismiss: vi.fn(),
    onRequestRelease: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  return { ...render(<SampleLockBlocker {...props} />), props }
}

describe('SampleLockBlocker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the dialog with data-testid="sample-lock-blocker"', () => {
    renderBlocker()
    expect(screen.getByTestId('sample-lock-blocker')).toBeInTheDocument()
  })

  it('displays the locked-by message with the tech name', () => {
    renderBlocker({ lockedByName: 'Ahmad Karimi' })
    const msg = screen.getByTestId('lock-blocker-message')
    expect(msg.textContent).toMatch(/Ahmad Karimi/)
  })

  it('shows "Request Release" button initially', () => {
    renderBlocker()
    expect(screen.getByTestId('request-release-button')).toBeInTheDocument()
  })

  it('calls onRequestRelease when "Request Release" is clicked and shows confirmation', async () => {
    const onRequestRelease = vi.fn().mockResolvedValue(undefined)
    renderBlocker({ onRequestRelease })

    fireEvent.click(screen.getByTestId('request-release-button'))

    await waitFor(() => {
      expect(onRequestRelease).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('release-requested-confirmation')).toBeInTheDocument()
    })

    // Request Release button should no longer be visible
    expect(screen.queryByTestId('request-release-button')).not.toBeInTheDocument()
  })

  it('calls onDismiss when the OK/dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    renderBlocker({ onDismiss })

    fireEvent.click(screen.getByTestId('dismiss-button'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('has role="dialog" and aria-modal for accessibility', () => {
    renderBlocker()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('RTL: dialog card uses logical CSS classes (no directional left/right)', () => {
    // Render in an RTL context by setting dir on document
    document.documentElement.setAttribute('dir', 'rtl')
    renderBlocker()
    const blocker = screen.getByTestId('sample-lock-blocker')
    // The backdrop should render correctly — no RTL-specific class breakage
    expect(blocker).toBeInTheDocument()
    // Buttons inside must not carry raw 'pl-' or 'pr-' classes (RTL-safe classes use 'ps-'/'pe-')
    const buttons = blocker.querySelectorAll('button')
    buttons.forEach((btn) => {
      expect(btn.className).not.toMatch(/\bpl-|\bpr-/)
    })
    document.documentElement.setAttribute('dir', 'ltr')
  })
})
