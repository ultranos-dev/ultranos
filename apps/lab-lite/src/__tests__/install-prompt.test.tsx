import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstallPrompt } from '../components/InstallPrompt'

const DISMISS_KEY = 'lab-lite-install-dismissed'

function fireBeforeInstallPrompt() {
  const promptMock = vi.fn().mockResolvedValue(undefined)
  const event = new Event('beforeinstallprompt', { cancelable: true })
  Object.defineProperty(event, 'prompt', { value: promptMock })
  Object.defineProperty(event, 'userChoice', {
    value: Promise.resolve({ outcome: 'accepted' as const }),
  })
  window.dispatchEvent(event)
  return { promptMock, event }
}

describe('InstallPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not show banner before 2 minutes', () => {
    render(<InstallPrompt />)
    fireBeforeInstallPrompt()

    act(() => {
      vi.advanceTimersByTime(60_000) // 1 minute
    })

    expect(screen.queryByText(/install lab lite/i)).not.toBeInTheDocument()
  })

  it('shows banner after 2 minutes when beforeinstallprompt fires', () => {
    render(<InstallPrompt />)
    fireBeforeInstallPrompt()

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000)
    })

    expect(screen.getByText(/install lab lite/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
  })

  it('does not show banner if beforeinstallprompt never fires', () => {
    render(<InstallPrompt />)

    act(() => {
      vi.advanceTimersByTime(3 * 60 * 1000)
    })

    expect(screen.queryByText(/install lab lite/i)).not.toBeInTheDocument()
  })

  it('persists dismissal to localStorage', async () => {
    vi.useRealTimers()

    render(<InstallPrompt />)
    fireBeforeInstallPrompt()

    // Directly set showBanner by re-rendering with a shorter delay
    // We need to use real timers for userEvent
    // Instead, let's test the localStorage logic directly
    vi.useFakeTimers()

    const { unmount } = render(<InstallPrompt />)
    fireBeforeInstallPrompt()

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000)
    })

    const dismissButton = screen.getByRole('button', { name: /dismiss/i })

    vi.useRealTimers()
    await userEvent.click(dismissButton)

    expect(localStorage.getItem(DISMISS_KEY)).toBe('true')
    expect(screen.queryByText(/install lab lite/i)).not.toBeInTheDocument()

    unmount()
  })

  it('does not show banner if previously dismissed', () => {
    localStorage.setItem(DISMISS_KEY, 'true')

    render(<InstallPrompt />)
    fireBeforeInstallPrompt()

    act(() => {
      vi.advanceTimersByTime(3 * 60 * 1000)
    })

    expect(screen.queryByText(/install lab lite/i)).not.toBeInTheDocument()
  })
})
