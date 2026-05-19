import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { AppShell } from '../AppShell.js'
import { DirectionalIcon } from '../components/DirectionalIcon'

describe('RTL Layout Support', () => {
  describe('AppShell', () => {
    it('uses logical CSS properties throughout (no physical left/right)', () => {
      const { container } = render(
        <AppShell appName="Test App" navItems={[{ label: 'Home', href: '/' }]}>
          <div>content</div>
        </AppShell>,
      )

      const allElements = container.querySelectorAll('*')
      allElements.forEach((el) => {
        const style = (el as HTMLElement).getAttribute('style') || ''
        expect(style).not.toMatch(/\bmargin-left\b/)
        expect(style).not.toMatch(/\bmargin-right\b/)
        expect(style).not.toMatch(/\bpadding-left\b/)
        expect(style).not.toMatch(/\bpadding-right\b/)
        expect(style).not.toMatch(/\bleft\s*:/)
        expect(style).not.toMatch(/\bright\s*:/)
        expect(style).not.toMatch(/\btext-align\s*:\s*(left|right)/)
      })
    })

    it('uses logical inset properties for positioning', () => {
      const { container } = render(
        <AppShell
          appName="Test App"
          user={{ name: 'Dr Test', email: 'test@test.com', role: 'Physician', initials: 'DT' }}
          onSignOut={() => {}}
        >
          <div>content</div>
        </AppShell>,
      )

      // Open dropdown
      const avatar = container.querySelector('button[aria-haspopup="menu"]') as HTMLElement
      fireEvent.click(avatar)

      const dropdown = container.querySelector('[role="menu"]')
      expect(dropdown).not.toBeNull()
      const dropdownStyle = (dropdown as HTMLElement).getAttribute('style') || ''
      // Should use inset-inline-end, not right
      expect(dropdownStyle).toContain('inset-inline-end')
      expect(dropdownStyle).not.toMatch(/\bright\s*:/)
    })

    it('uses text-align: start instead of left for menu items', () => {
      const { container } = render(
        <AppShell
          appName="Test App"
          user={{ name: 'Dr Test', email: 'test@test.com', role: 'Physician', initials: 'DT' }}
          onSignOut={() => {}}
        >
          <div>content</div>
        </AppShell>,
      )

      const avatar = container.querySelector('button[aria-haspopup="menu"]') as HTMLElement
      fireEvent.click(avatar)

      const signOutBtn = container.querySelector('button[role="menuitem"]')
      const style = (signOutBtn as HTMLElement)?.getAttribute('style') || ''
      expect(style).toContain('text-align: start')
    })
  })

  describe('DirectionalIcon RTL mirroring', () => {
    it('navigation icons get CSS variable-based transform', () => {
      const { container } = render(
        <DirectionalIcon category="navigation">
          <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
        </DirectionalIcon>,
      )
      const span = container.querySelector('span')
      expect(span?.style.transform).toBe('var(--directional-icon-transform, none)')
    })

    it('medical icons never get transform', () => {
      const { container } = render(
        <DirectionalIcon category="medical">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /></svg>
        </DirectionalIcon>,
      )
      const span = container.querySelector('span')
      expect(span?.style.transform).toBe('')
    })
  })
})
