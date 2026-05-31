/**
 * Story 48.4 — Escalation Timer Service Tests
 * AC: 3, 4, 5, 6
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  startEscalationTimer,
  stopEscalationTimer,
  stopAllEscalationTimers,
  getActiveTimerCount,
  onEscalationStep,
} from '../lib/escalation-timer'

vi.mock('../lib/escalation-manager', () => ({
  advanceEscalation: vi.fn().mockResolvedValue(null),
  getActiveEscalations: vi.fn().mockResolvedValue([]),
  catchUpMissedSteps: vi.fn().mockResolvedValue([]),
}))

import { advanceEscalation, getActiveEscalations, catchUpMissedSteps } from '../lib/escalation-manager'

describe('escalation timer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stopAllEscalationTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    stopAllEscalationTimers()
    vi.useRealTimers()
  })

  it('starts a timer for a new chain', () => {
    startEscalationTimer('chain-001')
    expect(getActiveTimerCount()).toBe(1)
  })

  it('is idempotent — does not create duplicate timers for same chain', () => {
    startEscalationTimer('chain-001')
    startEscalationTimer('chain-001')
    expect(getActiveTimerCount()).toBe(1)
  })

  it('stops a specific chain timer', () => {
    startEscalationTimer('chain-001')
    startEscalationTimer('chain-002')
    stopEscalationTimer('chain-001')
    expect(getActiveTimerCount()).toBe(1)
  })

  it('calls advanceEscalation at 1-minute intervals', async () => {
    startEscalationTimer('chain-001')
    // Advance time by 1 minute
    await vi.advanceTimersByTimeAsync(60_000)
    expect(advanceEscalation).toHaveBeenCalledWith('chain-001')
  })

  it('calls advanceEscalation multiple times', async () => {
    startEscalationTimer('chain-001')
    await vi.advanceTimersByTimeAsync(3 * 60_000)
    expect(advanceEscalation).toHaveBeenCalledTimes(3)
  })

  it('emits step event when advanceEscalation returns a step', async () => {
    const mockStep = { stepNumber: 2, type: 'inapp_notification', recipientId: 'prac-001', recipientRole: 'physician', scheduledAt: new Date().toISOString(), sentAt: null, acknowledgedAt: null, status: 'pending' as const }
    vi.mocked(advanceEscalation).mockResolvedValueOnce(mockStep)

    const events: any[] = []
    const unsub = onEscalationStep((e) => events.push(e))

    startEscalationTimer('chain-001')
    await vi.advanceTimersByTimeAsync(60_000)

    expect(events).toHaveLength(1)
    expect(events[0].chainId).toBe('chain-001')
    expect(events[0].step.stepNumber).toBe(2)

    unsub()
  })

  it('stopAllEscalationTimers clears all active timers', () => {
    startEscalationTimer('chain-001')
    startEscalationTimer('chain-002')
    startEscalationTimer('chain-003')
    stopAllEscalationTimers()
    expect(getActiveTimerCount()).toBe(0)
  })

  it('onEscalationStep returns an unsubscribe function', async () => {
    const mockStep = { stepNumber: 3, type: 'sms_physician' as const, recipientId: 'prac-001', recipientRole: 'physician', scheduledAt: new Date().toISOString(), sentAt: null, acknowledgedAt: null, status: 'pending' as const }
    vi.mocked(advanceEscalation).mockResolvedValue(mockStep)

    const events: any[] = []
    const unsub = onEscalationStep((e) => events.push(e))
    unsub() // unsubscribe immediately

    startEscalationTimer('chain-001')
    await vi.advanceTimersByTimeAsync(60_000)

    expect(events).toHaveLength(0) // unsubscribed — should not receive events
  })
})

describe('resumeActiveEscalations', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stopAllEscalationTimers()
    vi.clearAllMocks()
    // Mock window to simulate browser environment
    Object.defineProperty(global, 'window', { value: {}, writable: true })
  })

  afterEach(() => {
    stopAllEscalationTimers()
    vi.useRealTimers()
  })

  it('restarts timers for all active chains on startup', async () => {
    vi.mocked(getActiveEscalations).mockResolvedValue([
      { chainId: 'chain-001' } as any,
      { chainId: 'chain-002' } as any,
    ])
    vi.mocked(catchUpMissedSteps).mockResolvedValue([])

    const { resumeActiveEscalations } = await import('../lib/escalation-timer')
    await resumeActiveEscalations()

    expect(getActiveTimerCount()).toBe(2)
  })

  it('catches up missed steps on startup', async () => {
    const missedStep = { stepNumber: 3, type: 'sms_physician' as const, recipientId: 'prac-001', recipientRole: 'physician', scheduledAt: new Date().toISOString(), sentAt: null, acknowledgedAt: null, status: 'escalated' as const }
    vi.mocked(getActiveEscalations).mockResolvedValue([{ chainId: 'chain-001' } as any])
    vi.mocked(catchUpMissedSteps).mockResolvedValue([missedStep])

    const events: any[] = []
    const unsub = onEscalationStep((e) => events.push(e))

    const { resumeActiveEscalations } = await import('../lib/escalation-timer')
    await resumeActiveEscalations()

    expect(events).toHaveLength(1)
    expect(events[0].step.stepNumber).toBe(3)
    unsub()
  })
})
