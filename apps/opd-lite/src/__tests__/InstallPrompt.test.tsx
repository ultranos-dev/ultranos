import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstallPrompt } from '../components/InstallPrompt'

function createBeforeInstallPromptEvent() {
  const promptFn = vi.fn().mockResolvedValue(undefined)
  const userChoicePromise = Promise.resolve({ outcome: 'accepted' as const })
  const event = new Event('beforeinstallprompt', { cancelable: true })
  Object.defineProperty(event, 'prompt', { value: promptFn })
  Object.defineProperty(event, 'userChoice', { value: userChoicePromise })
  return { event, promptFn }
}

describe('InstallPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    // Default: not standalone
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not render banner immediately on mount', () => {
    render(<InstallPrompt />)
    expect(screen.queryByRole('banner')).toBeNull()
  })

  it('renders banner after 2-minute timeout when beforeinstallprompt event fires', () => {
    render(<InstallPrompt />)

    const { event } = createBeforeInstallPromptEvent()
    window.dispatchEvent(event)

    // Before 2 minutes — no banner
    act(() => {
      vi.advanceTimersByTime(119_999)
    })
    expect(screen.queryByRole('banner')).toBeNull()

    // At 2 minutes — banner appears
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByRole('banner')).toBeDefined()
    expect(screen.getByText('Install OPD Lite for offline access')).toBeDefined()
  })

  it('does not show banner after 2 minutes if no beforeinstallprompt event', () => {
    render(<InstallPrompt />)

    act(() => {
      vi.advanceTimersByTime(120_000)
    })
    expect(screen.queryByRole('banner')).toBeNull()
  })

  it('Install button triggers the deferred prompt', async () => {
    render(<InstallPrompt />)

    const { event, promptFn } = createBeforeInstallPromptEvent()
    window.dispatchEvent(event)

    act(() => {
      vi.advanceTimersByTime(120_000)
    })

    const installButton = screen.getByText('Install')
    // Need real timers for the async prompt call
    vi.useRealTimers()
    await userEvent.click(installButton)

    expect(promptFn).toHaveBeenCalledOnce()
  })

  it('Dismiss button hides banner and sets sessionStorage flag', async () => {
    render(<InstallPrompt />)

    const { event } = createBeforeInstallPromptEvent()
    window.dispatchEvent(event)

    act(() => {
      vi.advanceTimersByTime(120_000)
    })

    const dismissButton = screen.getByLabelText('Dismiss install banner')
    vi.useRealTimers()
    await userEvent.click(dismissButton)

    expect(screen.queryByRole('banner')).toBeNull()
    expect(sessionStorage.getItem('pwa-install-dismissed')).toBe('true')
  })

  it('does not show banner if sessionStorage has dismiss flag', () => {
    sessionStorage.setItem('pwa-install-dismissed', 'true')
    render(<InstallPrompt />)

    const { event } = createBeforeInstallPromptEvent()
    window.dispatchEvent(event)

    act(() => {
      vi.advanceTimersByTime(120_000)
    })
    expect(screen.queryByRole('banner')).toBeNull()
  })

  it('does not show banner if already installed (standalone mode)', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    render(<InstallPrompt />)

    const { event } = createBeforeInstallPromptEvent()
    window.dispatchEvent(event)

    act(() => {
      vi.advanceTimersByTime(120_000)
    })
    expect(screen.queryByRole('banner')).toBeNull()
  })

  it('hides banner on appinstalled event', () => {
    render(<InstallPrompt />)

    const { event } = createBeforeInstallPromptEvent()
    window.dispatchEvent(event)

    act(() => {
      vi.advanceTimersByTime(120_000)
    })
    expect(screen.getByRole('banner')).toBeDefined()

    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(screen.queryByRole('banner')).toBeNull()
  })
})
