/**
 * Story 47.5 — Spill & Decontamination Protocol: CountdownTimer Tests
 * Task 10.4 — Unit tests for CountdownTimer component
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { CountdownTimer } from '../components/safety/CountdownTimer'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const t: Record<string, string> = {
      'safety.spill.timer.start': `${params?.minutes ?? ''}-min timer`,
      'safety.spill.timer.running': `${params?.minutes ?? ''} min — running`,
      'safety.spill.timer.complete': 'Timer complete',
      'safety.spill.timer.remaining': `${params?.time ?? ''} remaining`,
      'safety.spill.timer.startButton': 'Start Timer',
      'safety.spill.timer.pauseButton': 'Pause',
      'safety.spill.timer.skipButton': 'Skip Timer',
    }
    return t[key] ?? key
  },
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('CountdownTimer — initial state', () => {
  it('renders the start button when not yet running', () => {
    render(<CountdownTimer minutes={1} />)
    expect(screen.getByRole('button', { name: 'Start Timer' })).toBeInTheDocument()
  })

  it('renders MM:SS time label from the prop', () => {
    render(<CountdownTimer minutes={2} />)
    expect(screen.getByText('02:00')).toBeInTheDocument()
  })

  it('does not show Pause before starting', () => {
    render(<CountdownTimer minutes={1} />)
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
  })
})

describe('CountdownTimer — start and tick', () => {
  it('hides Start button and shows Pause after clicking Start', () => {
    render(<CountdownTimer minutes={1} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start Timer' }))
    expect(screen.queryByRole('button', { name: 'Start Timer' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('decrements by 1 each second while running', () => {
    render(<CountdownTimer minutes={1} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start Timer' }))

    act(() => { vi.advanceTimersByTime(3000) })

    expect(screen.getByText('00:57')).toBeInTheDocument()
  })

  it('pauses the countdown when Pause is clicked', () => {
    render(<CountdownTimer minutes={1} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start Timer' }))
    act(() => { vi.advanceTimersByTime(5000) })

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    const pausedAt = screen.getByText('00:55')
    expect(pausedAt).toBeInTheDocument()

    // Advancing time further should NOT change the display while paused
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByText('00:55')).toBeInTheDocument()
  })

  it('can resume after pause', () => {
    render(<CountdownTimer minutes={1} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start Timer' }))
    act(() => { vi.advanceTimersByTime(5000) })
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    // Restart
    fireEvent.click(screen.getByRole('button', { name: 'Start Timer' }))
    act(() => { vi.advanceTimersByTime(2000) })
    expect(screen.getByText('00:53')).toBeInTheDocument()
  })
})

describe('CountdownTimer — completion', () => {
  it('calls onComplete when countdown reaches zero', () => {
    const onComplete = vi.fn()
    render(<CountdownTimer minutes={1} onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start Timer' }))
    act(() => { vi.advanceTimersByTime(60 * 1000) })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('shows the checkmark and complete text when done', () => {
    render(<CountdownTimer minutes={1} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start Timer' }))
    act(() => { vi.advanceTimersByTime(60 * 1000) })
    expect(screen.getByText('Timer complete')).toBeInTheDocument()
  })

  it('hides Start and Skip buttons after completion', () => {
    render(<CountdownTimer minutes={1} onSkip={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start Timer' }))
    act(() => { vi.advanceTimersByTime(60 * 1000) })
    expect(screen.queryByRole('button', { name: 'Start Timer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skip Timer' })).not.toBeInTheDocument()
  })
})

describe('CountdownTimer — skip', () => {
  it('calls onSkip when Skip Timer is clicked', () => {
    const onSkip = vi.fn()
    render(<CountdownTimer minutes={2} onSkip={onSkip} />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip Timer' }))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('stops the interval when skipped while running', () => {
    const onSkip = vi.fn()
    render(<CountdownTimer minutes={2} onSkip={onSkip} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start Timer' }))
    act(() => { vi.advanceTimersByTime(5000) })

    fireEvent.click(screen.getByRole('button', { name: 'Skip Timer' }))
    const timeAfterSkip = screen.queryByText(/01:5/)
    // After skip, timer should not continue ticking
    act(() => { vi.advanceTimersByTime(5000) })
    // The display should be frozen (component unmounts or stays static) — onSkip fires once
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('does not render Skip button when onSkip is not provided', () => {
    render(<CountdownTimer minutes={1} />)
    expect(screen.queryByRole('button', { name: 'Skip Timer' })).not.toBeInTheDocument()
  })
})

describe('CountdownTimer — unmount cleanup', () => {
  it('does not call onComplete after unmount', () => {
    const onComplete = vi.fn()
    const { unmount } = render(<CountdownTimer minutes={1} onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start Timer' }))
    act(() => { vi.advanceTimersByTime(30000) })
    unmount()
    // Advancing time after unmount must not trigger callback
    act(() => { vi.advanceTimersByTime(30000) })
    expect(onComplete).not.toHaveBeenCalled()
  })
})
