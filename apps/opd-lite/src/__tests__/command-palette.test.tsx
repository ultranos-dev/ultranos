import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandPalette } from '@/components/layout/CommandPalette'

describe('CommandPalette', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
  })

  describe('overlay behavior', () => {
    it('renders nothing when closed', () => {
      render(<CommandPalette open={false} onOpenChange={() => {}} />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('renders an accessible dialog when open', () => {
      render(<CommandPalette open={true} onOpenChange={() => {}} />)
      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeInTheDocument()
      expect(dialog).toHaveAttribute('aria-modal', 'true')
    })

    it('contains a search input when open', () => {
      render(<CommandPalette open={true} onOpenChange={() => {}} />)
      expect(screen.getByPlaceholderText(/search clinical actions/i)).toBeInTheDocument()
    })
  })

  describe('fuzzy search filtering', () => {
    it('shows all commands when input is empty', () => {
      render(<CommandPalette open={true} onOpenChange={() => {}} />)
      expect(screen.getByText('Vitals')).toBeInTheDocument()
      expect(screen.getByText('Assessment')).toBeInTheDocument()
      expect(screen.getByText('Subjective')).toBeInTheDocument()
      expect(screen.getByText('Objective')).toBeInTheDocument()
    })

    it('filters commands based on fuzzy search input', async () => {
      render(<CommandPalette open={true} onOpenChange={() => {}} />)
      const input = screen.getByPlaceholderText(/search clinical actions/i)
      await user.type(input, 'vital')
      expect(screen.getByText('Vitals')).toBeInTheDocument()
      // Other items should be filtered out by cmdk
    })

    it('search is case-insensitive', async () => {
      render(<CommandPalette open={true} onOpenChange={() => {}} />)
      const input = screen.getByPlaceholderText(/search clinical actions/i)
      await user.type(input, 'VITAL')
      expect(screen.getByText('Vitals')).toBeInTheDocument()
    })
  })

  describe('action selection and focus', () => {
    it('calls onOpenChange(false) when an action is selected', async () => {
      const onOpenChange = vi.fn()
      render(<CommandPalette open={true} onOpenChange={onOpenChange} />)
      const vitalsItem = screen.getByText('Vitals')
      await user.click(vitalsItem)
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('calls onSelect callback with the selected command id', async () => {
      const onSelect = vi.fn()
      render(<CommandPalette open={true} onOpenChange={() => {}} onSelect={onSelect} />)
      const vitalsItem = screen.getByText('Vitals')
      await user.click(vitalsItem)
      expect(onSelect).toHaveBeenCalledWith('vitals')
    })
  })

  describe('keyboard accessibility', () => {
    it('closes when Escape is pressed', async () => {
      const onOpenChange = vi.fn()
      render(<CommandPalette open={true} onOpenChange={onOpenChange} />)
      await user.keyboard('{Escape}')
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('selects item on Enter after navigating with arrow keys', async () => {
      const onSelect = vi.fn()
      render(<CommandPalette open={true} onOpenChange={() => {}} onSelect={onSelect} />)
      // Arrow down to first item, then press Enter
      await user.keyboard('{ArrowDown}{Enter}')
      expect(onSelect).toHaveBeenCalled()
    })
  })

  describe('focus management (AC3)', () => {
    it('scrolls to and focuses the target section when an action is selected', async () => {
      // Create a target section in the DOM
      const section = document.createElement('section')
      section.setAttribute('data-section', 'vitals')
      const input = document.createElement('input')
      section.appendChild(input)
      document.body.appendChild(section)

      const scrollSpy = vi.spyOn(section, 'scrollIntoView')

      render(<CommandPalette open={true} onOpenChange={() => {}} />)
      const vitalsItem = screen.getByText('Vitals')
      await user.click(vitalsItem)

      // focusSection is deferred via requestAnimationFrame
      await new Promise((r) => requestAnimationFrame(r))

      expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
      expect(document.activeElement).toBe(input)

      document.body.removeChild(section)
    })

    it('falls back to getElementById for sections without data-section', async () => {
      const textarea = document.createElement('textarea')
      textarea.id = 'soap-subjective'
      document.body.appendChild(textarea)

      render(<CommandPalette open={true} onOpenChange={() => {}} />)
      const subjectiveItem = screen.getByText('Subjective')
      await user.click(subjectiveItem)

      await new Promise((r) => requestAnimationFrame(r))

      expect(document.activeElement).toBe(textarea)

      document.body.removeChild(textarea)
    })
  })

  describe('RTL rendering', () => {
    it('renders correctly in RTL direction', () => {
      document.documentElement.setAttribute('dir', 'rtl')
      const { container } = render(<CommandPalette open={true} onOpenChange={() => {}} />)
      expect(container.firstChild).toMatchSnapshot()
      document.documentElement.removeAttribute('dir')
    })

    it('renders correctly in LTR direction', () => {
      document.documentElement.setAttribute('dir', 'ltr')
      const { container } = render(<CommandPalette open={true} onOpenChange={() => {}} />)
      expect(container.firstChild).toMatchSnapshot()
      document.documentElement.removeAttribute('dir')
    })
  })
})
