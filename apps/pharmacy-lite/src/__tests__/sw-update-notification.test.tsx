import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SwUpdateNotification } from '../components/SwUpdateNotification'

describe('SwUpdateNotification', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('does not render when no service worker update is available', () => {
    // Mock navigator.serviceWorker with a ready promise that resolves to a registration
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve({
          addEventListener: vi.fn(),
          installing: null,
          waiting: null,
        }),
        controller: {},
      },
      writable: true,
      configurable: true,
    })

    const { container } = render(<SwUpdateNotification />)
    expect(container.firstChild).toBeNull()
  })

  it('shows update toast when new service worker is installed', async () => {
    let updateFoundCallback: (() => void) | null = null
    const mockRegistration = {
      addEventListener: vi.fn((event: string, cb: () => void) => {
        if (event === 'updatefound') updateFoundCallback = cb
      }),
      installing: null as unknown,
      waiting: { postMessage: vi.fn() },
    }

    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve(mockRegistration),
        controller: {},
      },
      writable: true,
      configurable: true,
    })

    render(<SwUpdateNotification />)

    // Wait for the ready promise
    await vi.waitFor(() => {
      expect(mockRegistration.addEventListener).toHaveBeenCalledWith('updatefound', expect.any(Function))
    })

    // Simulate a new worker being installed
    let stateChangeCallback: (() => void) | null = null
    const newWorker = {
      state: 'installing',
      addEventListener: vi.fn((event: string, cb: () => void) => {
        if (event === 'statechange') stateChangeCallback = cb
      }),
    }
    mockRegistration.installing = newWorker

    updateFoundCallback!()

    // Simulate worker transitioning to installed state
    Object.defineProperty(newWorker, 'state', { value: 'installed', writable: true })
    stateChangeCallback!()

    await vi.waitFor(() => {
      // Component uses t('newVersionAvailable') — global i18n mock returns the key string
      expect(screen.getByText('newVersionAvailable')).toBeInTheDocument()
    })
  })

  it('dismisses toast when Later is clicked', async () => {
    let updateFoundCallback: (() => void) | null = null
    const mockRegistration = {
      addEventListener: vi.fn((event: string, cb: () => void) => {
        if (event === 'updatefound') updateFoundCallback = cb
      }),
      installing: null as unknown,
      waiting: { postMessage: vi.fn() },
    }

    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve(mockRegistration),
        controller: {},
      },
      writable: true,
      configurable: true,
    })

    render(<SwUpdateNotification />)

    await vi.waitFor(() => {
      expect(mockRegistration.addEventListener).toHaveBeenCalled()
    })

    let stateChangeCallback: (() => void) | null = null
    const newWorker = {
      state: 'installing',
      addEventListener: vi.fn((event: string, cb: () => void) => {
        if (event === 'statechange') stateChangeCallback = cb
      }),
    }
    mockRegistration.installing = newWorker
    updateFoundCallback!()
    Object.defineProperty(newWorker, 'state', { value: 'installed', writable: true })
    stateChangeCallback!()

    await vi.waitFor(() => {
      // Component uses t('later') — global i18n mock returns the key string
      expect(screen.getByText('later')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('later'))
    // After dismiss, the update banner should be gone
    expect(screen.queryByText('newVersionAvailable')).toBeNull()
  })
})
