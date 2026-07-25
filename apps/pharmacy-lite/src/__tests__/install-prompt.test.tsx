import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { InstallPrompt } from '../components/InstallPrompt'

// InstallPrompt calls useSidebar() internally; mock the sidebar module to avoid
// "useSidebar must be used within a SidebarProvider" error in unit tests.
vi.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => ({ state: 'expanded', open: true }),
}))

describe('InstallPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not render initially', () => {
    const { container } = render(<InstallPrompt />)
    expect(container.firstChild).toBeNull()
  })

  it('shows banner after 2-minute delay when beforeinstallprompt fires', async () => {
    render(<InstallPrompt />)

    // Simulate beforeinstallprompt event
    const promptEvent = new Event('beforeinstallprompt') as Event & {
      preventDefault: () => void
      prompt: () => Promise<void>
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
    }
    Object.assign(promptEvent, {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    })

    act(() => {
      window.dispatchEvent(promptEvent)
    })

    // Not visible yet
    // Component uses t('prompt') — i18n mock returns key string 'prompt'
    expect(screen.queryByText('prompt')).toBeNull()

    // Advance past 2-minute delay
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000)
    })

    expect(screen.getByText('prompt')).toBeInTheDocument()
  })

  it('dismisses and saves to sessionStorage when dismiss button clicked', async () => {
    render(<InstallPrompt />)

    const promptEvent = new Event('beforeinstallprompt') as Event & {
      prompt: () => Promise<void>
      userChoice: Promise<{ outcome: 'dismissed' }>
    }
    Object.assign(promptEvent, {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    })

    act(() => {
      window.dispatchEvent(promptEvent)
    })

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000)
    })

    // Component uses t('notNow') — i18n mock returns key string 'notNow'
    fireEvent.click(screen.getByText('notNow'))
    expect(screen.queryByText('prompt')).toBeNull()
    expect(sessionStorage.getItem('pharmacy-lite-install-dismissed')).toBe('1')
  })

  it('does not show if previously dismissed in session', () => {
    sessionStorage.setItem('pharmacy-lite-install-dismissed', '1')
    render(<InstallPrompt />)

    const promptEvent = new Event('beforeinstallprompt')
    window.dispatchEvent(promptEvent)

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000)
    })

    expect(screen.queryByText('prompt')).toBeNull()
  })
})
