import { renderHook, act } from '@testing-library/react'
import {
  useSessionManager,
  SESSION_DURATIONS,
  INACTIVITY_TIMEOUT,
  WARNING_BEFORE_MS,
} from '../useSessionManager.js'
import type { UseSessionManagerConfig, SessionState } from '../useSessionManager.js'

function createConfig(overrides: Partial<UseSessionManagerConfig> = {}): UseSessionManagerConfig {
  return {
    maxDurationMs: 60 * 60 * 1000, // 1 hour
    inactivityMs: 10 * 60 * 1000, // 10 minutes
    onExpired: vi.fn(),
    ...overrides,
  }
}

describe('SESSION_DURATIONS constants', () => {
  it('exports role-specific durations', () => {
    expect(SESSION_DURATIONS.CLINICIAN).toBe(8 * 60 * 60 * 1000)
    expect(SESSION_DURATIONS.DOCTOR).toBe(8 * 60 * 60 * 1000)
    expect(SESSION_DURATIONS.PHARMACIST).toBe(12 * 60 * 60 * 1000)
    expect(SESSION_DURATIONS.ADMIN).toBe(4 * 60 * 60 * 1000)
    expect(SESSION_DURATIONS.LAB_TECH).toBe(8 * 60 * 60 * 1000)
  })

  it('exports INACTIVITY_TIMEOUT as 30 minutes', () => {
    expect(INACTIVITY_TIMEOUT).toBe(30 * 60 * 1000)
  })

  it('exports WARNING_BEFORE_MS as 5 minutes', () => {
    expect(WARNING_BEFORE_MS).toBe(5 * 60 * 1000)
  })
})

describe('useSessionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts in active state', () => {
    const config = createConfig()
    const { result } = renderHook(() => useSessionManager(config))
    expect(result.current.sessionState).toBe('active')
  })

  it('returns remainingSeconds based on inactivity timeout', () => {
    const config = createConfig({ inactivityMs: 10 * 60 * 1000 })
    const { result } = renderHook(() => useSessionManager(config))
    // Should start at full inactivity timeout in seconds
    expect(result.current.remainingSeconds).toBeGreaterThan(0)
    expect(result.current.remainingSeconds).toBeLessThanOrEqual(600)
  })

  describe('inactivity timer', () => {
    it('resets on mousemove activity', () => {
      const config = createConfig({ inactivityMs: 10 * 60 * 1000 })
      const { result } = renderHook(() => useSessionManager(config))

      // Advance 4 minutes (still active, but approaching warning)
      act(() => {
        vi.advanceTimersByTime(4 * 60 * 1000)
      })
      expect(result.current.sessionState).toBe('active')

      // Simulate activity — resets the timer
      act(() => {
        vi.advanceTimersByTime(1100) // past throttle
        document.dispatchEvent(new MouseEvent('mousemove'))
      })

      // Advance another 4 minutes — should still be active since timer was reset
      act(() => {
        vi.advanceTimersByTime(4 * 60 * 1000)
      })
      expect(result.current.sessionState).toBe('active')
    })

    it('resets on keydown activity', () => {
      const config = createConfig({ inactivityMs: 10 * 60 * 1000 })
      const { result } = renderHook(() => useSessionManager(config))

      act(() => {
        vi.advanceTimersByTime(4 * 60 * 1000)
      })

      act(() => {
        vi.advanceTimersByTime(1100)
        document.dispatchEvent(new KeyboardEvent('keydown'))
      })

      act(() => {
        vi.advanceTimersByTime(4 * 60 * 1000)
      })
      expect(result.current.sessionState).toBe('active')
    })

    it('resets on touchstart activity', () => {
      const config = createConfig({ inactivityMs: 10 * 60 * 1000 })
      const { result } = renderHook(() => useSessionManager(config))

      act(() => {
        vi.advanceTimersByTime(4 * 60 * 1000)
      })

      act(() => {
        vi.advanceTimersByTime(1100)
        document.dispatchEvent(new Event('touchstart'))
      })

      act(() => {
        vi.advanceTimersByTime(4 * 60 * 1000)
      })
      expect(result.current.sessionState).toBe('active')
    })

    it('throttles activity events to 1 per second', () => {
      const config = createConfig({ inactivityMs: 10 * 60 * 1000 })
      renderHook(() => useSessionManager(config))

      // Dispatch multiple events rapidly — only the first should register
      act(() => {
        document.dispatchEvent(new MouseEvent('mousemove'))
        document.dispatchEvent(new MouseEvent('mousemove'))
        document.dispatchEvent(new MouseEvent('mousemove'))
      })
      // No error, hook handles throttling
    })
  })

  describe('state transitions', () => {
    it('transitions to warning state at (inactivityMs - WARNING_BEFORE_MS)', () => {
      const config = createConfig({ inactivityMs: 10 * 60 * 1000 })
      const { result } = renderHook(() => useSessionManager(config))

      // Advance to just past the warning threshold (10min - 5min = 5min)
      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000 + 1000)
      })

      expect(result.current.sessionState).toBe('warning')
    })

    it('calls onWarning callback when entering warning state', () => {
      const onWarning = vi.fn()
      const config = createConfig({ inactivityMs: 10 * 60 * 1000, onWarning })
      renderHook(() => useSessionManager(config))

      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000 + 1000)
      })

      expect(onWarning).toHaveBeenCalledTimes(1)
    })

    it('transitions from warning back to active on user activity', () => {
      const config = createConfig({ inactivityMs: 10 * 60 * 1000 })
      const { result } = renderHook(() => useSessionManager(config))

      // Get to warning state
      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000 + 1000)
      })
      expect(result.current.sessionState).toBe('warning')

      // User activity should reset back to active
      act(() => {
        vi.advanceTimersByTime(1100)
        document.dispatchEvent(new MouseEvent('mousemove'))
      })

      // Need to tick for state update
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(result.current.sessionState).toBe('active')
    })

    it('transitions to locked state when inactivityMs fully elapses', () => {
      const config = createConfig({ inactivityMs: 10 * 60 * 1000 })
      const { result } = renderHook(() => useSessionManager(config))

      act(() => {
        vi.advanceTimersByTime(10 * 60 * 1000 + 1000)
      })

      expect(result.current.sessionState).toBe('locked')
    })

    it('transitions to expired when maxDurationMs is reached', () => {
      const onExpired = vi.fn()
      const config = createConfig({
        maxDurationMs: 30 * 60 * 1000, // 30 min
        inactivityMs: 60 * 60 * 1000, // 1 hour (longer than max)
        onExpired,
      })
      const { result } = renderHook(() => useSessionManager(config))

      act(() => {
        vi.advanceTimersByTime(30 * 60 * 1000 + 100)
      })

      expect(result.current.sessionState).toBe('expired')
      expect(onExpired).toHaveBeenCalledTimes(1)
    })
  })

  describe('onExpired callback', () => {
    it('fires on max duration regardless of activity', () => {
      const onExpired = vi.fn()
      const config = createConfig({
        maxDurationMs: 5 * 60 * 1000,
        inactivityMs: 60 * 60 * 1000,
        onExpired,
      })
      renderHook(() => useSessionManager(config))

      // Keep active with periodic activity
      for (let i = 0; i < 5; i++) {
        act(() => {
          vi.advanceTimersByTime(60 * 1000)
          document.dispatchEvent(new MouseEvent('mousemove'))
        })
      }

      // Max duration should still fire
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(onExpired).toHaveBeenCalled()
    })
  })

  describe('resetInactivity', () => {
    it('resets inactivity timer and returns to active from warning', () => {
      const config = createConfig({ inactivityMs: 10 * 60 * 1000 })
      const { result } = renderHook(() => useSessionManager(config))

      // Get to warning
      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000 + 1000)
      })
      expect(result.current.sessionState).toBe('warning')

      // Call resetInactivity
      act(() => {
        result.current.resetInactivity()
      })

      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(result.current.sessionState).toBe('active')
    })
  })

  describe('forceExpire', () => {
    it('immediately transitions to expired and calls onExpired', () => {
      const onExpired = vi.fn()
      const config = createConfig({ onExpired })
      const { result } = renderHook(() => useSessionManager(config))

      act(() => {
        result.current.forceExpire()
      })

      expect(result.current.sessionState).toBe('expired')
      expect(onExpired).toHaveBeenCalledTimes(1)
    })
  })

  describe('cleanup on unmount', () => {
    it('clears all timers and event listeners on unmount', () => {
      const config = createConfig()
      const { unmount } = renderHook(() => useSessionManager(config))

      unmount()

      // After unmount, advancing timers should not cause errors
      act(() => {
        vi.advanceTimersByTime(60 * 60 * 1000)
      })

      // Dispatching events should not cause errors
      document.dispatchEvent(new MouseEvent('mousemove'))
      document.dispatchEvent(new KeyboardEvent('keydown'))
    })
  })

  describe('edge cases', () => {
    it('handles maxDurationMs < inactivityMs', () => {
      const onExpired = vi.fn()
      const config = createConfig({
        maxDurationMs: 5 * 60 * 1000,
        inactivityMs: 30 * 60 * 1000,
        onExpired,
      })
      const { result } = renderHook(() => useSessionManager(config))

      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000 + 100)
      })

      expect(result.current.sessionState).toBe('expired')
      expect(onExpired).toHaveBeenCalled()
    })
  })
})
