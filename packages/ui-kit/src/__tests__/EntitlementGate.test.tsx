import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EntitlementGate } from '../EntitlementGate.js'

const defaultProps = {
  moduleCode: 'OPD_LITE',
  moduleName: 'OPD Lite',
  status: 'active' as const,
  onSignOut: vi.fn(),
}

describe('EntitlementGate', () => {
  it('renders children when status is active', () => {
    render(
      <EntitlementGate {...defaultProps} status="active">
        <div>App Content</div>
      </EntitlementGate>
    )
    expect(screen.getByText('App Content')).toBeInTheDocument()
  })

  it('renders children when status is trial', () => {
    render(
      <EntitlementGate {...defaultProps} status="trial">
        <div>App Content</div>
      </EntitlementGate>
    )
    expect(screen.getByText('App Content')).toBeInTheDocument()
  })

  it('renders gate page when status is inactive', () => {
    render(
      <EntitlementGate {...defaultProps} status="inactive">
        <div>App Content</div>
      </EntitlementGate>
    )
    expect(screen.queryByText('App Content')).not.toBeInTheDocument()
    expect(
      screen.getByText(/your organization has not subscribed to OPD Lite/i)
    ).toBeInTheDocument()
  })

  it('renders loading state when status is checking', () => {
    render(
      <EntitlementGate {...defaultProps} status="checking">
        <div>App Content</div>
      </EntitlementGate>
    )
    expect(screen.queryByText('App Content')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders loading state when status is null', () => {
    render(
      <EntitlementGate {...defaultProps} status={null}>
        <div>App Content</div>
      </EntitlementGate>
    )
    expect(screen.queryByText('App Content')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('displays module name in the gate page message', () => {
    render(
      <EntitlementGate {...defaultProps} moduleName="Lab Diagnostics Portal" status="inactive">
        <div>App Content</div>
      </EntitlementGate>
    )
    expect(
      screen.getByText(/your organization has not subscribed to Lab Diagnostics Portal/i)
    ).toBeInTheDocument()
  })

  it('displays admin email as mailto link when provided', () => {
    render(
      <EntitlementGate {...defaultProps} status="inactive" adminEmail="admin@hospital.org">
        <div>App Content</div>
      </EntitlementGate>
    )
    const link = screen.getByRole('link', { name: /admin@hospital\.org/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', 'mailto:admin@hospital.org')
  })

  it('does not show admin email section when not provided', () => {
    render(
      <EntitlementGate {...defaultProps} status="inactive">
        <div>App Content</div>
      </EntitlementGate>
    )
    expect(screen.queryByText(/contact:/i)).not.toBeInTheDocument()
  })

  it('sign out button is visible and calls onSignOut when clicked', () => {
    const onSignOut = vi.fn()
    render(
      <EntitlementGate {...defaultProps} status="inactive" onSignOut={onSignOut}>
        <div>App Content</div>
      </EntitlementGate>
    )
    const button = screen.getByRole('button', { name: /sign out/i })
    expect(button).toBeInTheDocument()
    fireEvent.click(button)
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('uses logical CSS properties for RTL compatibility (no physical margin-left/padding-right)', () => {
    const { container } = render(
      <EntitlementGate {...defaultProps} status="inactive">
        <div>App Content</div>
      </EntitlementGate>
    )
    // Check the raw style attribute strings to verify no physical directional
    // properties are used. jsdom may expand logical shorthands (e.g. paddingInline)
    // to physical properties internally, so we inspect the source attribute.
    const allElements = container.querySelectorAll('[style]')
    allElements.forEach((el) => {
      const styleAttr = el.getAttribute('style') ?? ''
      expect(styleAttr).not.toMatch(/\bmargin-left\b/)
      expect(styleAttr).not.toMatch(/\bmargin-right\b/)
      expect(styleAttr).not.toMatch(/\bpadding-left\b/)
      expect(styleAttr).not.toMatch(/\bpadding-right\b/)
      expect(styleAttr).not.toMatch(/\btext-align:\s*left\b/)
      expect(styleAttr).not.toMatch(/\btext-align:\s*right\b/)
    })
  })

  it('does not use hardcoded color values — uses design tokens', () => {
    const { container } = render(
      <EntitlementGate {...defaultProps} status="inactive">
        <div>App Content</div>
      </EntitlementGate>
    )
    const allElements = container.querySelectorAll('*')
    allElements.forEach((el) => {
      const style = (el as HTMLElement).style
      const bgColor = style.getPropertyValue('background-color')
      const color = style.getPropertyValue('color')
      // No raw hex colors — only hsl() tokens or transparent/inherit/empty
      if (bgColor) {
        expect(bgColor).not.toMatch(/^#[0-9a-fA-F]{3,8}$/)
      }
      if (color) {
        expect(color).not.toMatch(/^#[0-9a-fA-F]{3,8}$/)
      }
    })
  })
})
