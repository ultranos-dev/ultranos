import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { InstallPrompt } from '../components/InstallPrompt'

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
    expect(screen.queryByText('Install Pharmacy Lite for quick access')).toBeNull()

    // Advance past 2-minute delay
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000)
    })

    expect(screen.getByText('Install Pharmacy Lite for quick access')).toBeInTheDocument()
  })

  it('dismisses and saves to sessionStorage when "Not now" clicked', async () => {
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

    fireEvent.click(screen.getByText('Not now'))
    expect(screen.queryByText('Install Pharmacy Lite for quick access')).toBeNull()
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

    expect(screen.queryByText('Install Pharmacy Lite for quick access')).toBeNull()
  })
})
