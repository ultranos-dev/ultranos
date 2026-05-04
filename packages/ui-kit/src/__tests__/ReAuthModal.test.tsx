import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReAuthModal } from '../ReAuthModal.js'
import type { ReAuthModalProps } from '../ReAuthModal.js'

function renderModal(overrides: Partial<ReAuthModalProps> = {}) {
  const props: ReAuthModalProps = {
    userEmail: 'doctor@hospital.test',
    onReAuth: vi.fn().mockResolvedValue(true),
    onSignOut: vi.fn(),
    ...overrides,
  }
  return { ...render(<ReAuthModal {...props} />), props }
}

describe('ReAuthModal', () => {
  it('renders password field and buttons', () => {
    renderModal()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /verify/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('displays user email', () => {
    renderModal({ userEmail: 'admin@clinic.test' })
    expect(screen.getByText('admin@clinic.test')).toBeInTheDocument()
  })

  it('renders as a dialog with proper accessibility attributes', () => {
    renderModal()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby')
  })

  it('calls onReAuth with password on successful verification', async () => {
    const onReAuth = vi.fn().mockResolvedValue(true)
    renderModal({ onReAuth })

    const input = screen.getByLabelText(/password/i)
    fireEvent.change(input, { target: { value: 'mypassword' } })
    fireEvent.click(screen.getByRole('button', { name: /verify/i }))

    await waitFor(() => {
      expect(onReAuth).toHaveBeenCalledWith('mypassword')
    })
  })

  it('shows error message on failed re-auth', async () => {
    const onReAuth = vi.fn().mockResolvedValue(false)
    renderModal({ onReAuth })

    const input = screen.getByLabelText(/password/i)
    fireEvent.change(input, { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /verify/i }))

    await waitFor(() => {
      expect(screen.getByText(/invalid password/i)).toBeInTheDocument()
    })
  })

  it('calls onSignOut when Sign Out button is clicked', () => {
    const onSignOut = vi.fn()
    renderModal({ onSignOut })

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('traps focus within the modal on Tab', () => {
    renderModal()
    const dialog = screen.getByRole('dialog')
    const focusableElements = dialog.querySelectorAll<HTMLElement>('input, button')
    expect(focusableElements.length).toBeGreaterThanOrEqual(3)

    // Focus the last element, then Tab should wrap to first
    const last = focusableElements[focusableElements.length - 1]!
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(focusableElements[0])

    // Focus the first element, then Shift+Tab should wrap to last
    focusableElements[0]!.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('calls onSignOut when Escape key is pressed', () => {
    const onSignOut = vi.fn()
    renderModal({ onSignOut })

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('shows error message when onReAuth throws', async () => {
    const onReAuth = vi.fn().mockRejectedValue(new Error('Network error'))
    renderModal({ onReAuth })

    const input = screen.getByLabelText(/password/i)
    fireEvent.change(input, { target: { value: 'test' } })
    fireEvent.click(screen.getByRole('button', { name: /verify/i }))

    await waitFor(() => {
      expect(screen.getByText(/authentication failed/i)).toBeInTheDocument()
    })
  })

  it('calls onReAuth on form submit (Enter key)', async () => {
    const onReAuth = vi.fn().mockResolvedValue(true)
    renderModal({ onReAuth })

    const input = screen.getByLabelText(/password/i)
    fireEvent.change(input, { target: { value: 'secret' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(onReAuth).toHaveBeenCalledWith('secret')
    })
  })
})
