/**
 * LearningNotification Component Tests — Story 46.2 (Task 3, 8)
 * Tests: dismiss behavior, session suppression, "Start" action, accessibility.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string, params?: Record<string, unknown>) => {
    const msgs: Record<string, string> = {
      notificationTitle: 'Quick refresher available: {procedureName} ({minutes} min)',
      'triggerReason.first_time': 'First time performing this procedure',
      'triggerReason.skill_decay': 'It has been a while since your last time',
      'triggerReason.new_sop': 'This procedure has an updated SOP',
      start: 'Start',
      dismiss: 'Dismiss',
    }
    let msg = msgs[key] ?? key
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        msg = msg.replace(`{${k}}`, String(v))
      })
    }
    return msg
  },
  useLocale: () => 'en',
}))

import {
  LearningNotification,
  isSessionDismissed,
  clearSessionDismissals,
} from '../components/learning/LearningNotification'
import type { TriggerResult } from '../lib/micro-learning-types'

const trigger: TriggerResult = {
  type: 'first_time',
  moduleId: 'mod-1',
  procedureName: 'Complete Blood Count',
  durationMinutes: 3,
}

describe('LearningNotification (Task 3)', () => {
  const onStart = vi.fn()
  const onDismiss = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    clearSessionDismissals()
  })

  it('renders the notification with procedure name and duration', () => {
    render(
      <LearningNotification
        trigger={trigger}
        procedureRef="CBC-85025"
        onStart={onStart}
        onDismiss={onDismiss}
      />
    )

    expect(screen.getByTestId('learning-notification')).toBeDefined()
    expect(screen.getByText(/Complete Blood Count/)).toBeDefined()
    expect(screen.getByText(/3 min/)).toBeDefined()
  })

  it('shows Start and Dismiss buttons', () => {
    render(
      <LearningNotification
        trigger={trigger}
        procedureRef="CBC-85025"
        onStart={onStart}
        onDismiss={onDismiss}
      />
    )

    expect(screen.getByTestId('learning-notification-start')).toBeDefined()
    expect(screen.getByTestId('learning-notification-dismiss')).toBeDefined()
  })

  it('calls onStart and hides notification when Start is clicked', () => {
    render(
      <LearningNotification
        trigger={trigger}
        procedureRef="CBC-85025"
        onStart={onStart}
        onDismiss={onDismiss}
      />
    )

    fireEvent.click(screen.getByTestId('learning-notification-start'))
    expect(onStart).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('learning-notification')).toBeNull()
  })

  it('calls onDismiss, marks session-dismissed, and hides when Dismiss clicked', () => {
    render(
      <LearningNotification
        trigger={trigger}
        procedureRef="CBC-85025"
        onStart={onStart}
        onDismiss={onDismiss}
      />
    )

    fireEvent.click(screen.getByTestId('learning-notification-dismiss'))
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('learning-notification')).toBeNull()
    // Session-scoped suppression (AC 5, Dev Notes)
    expect(isSessionDismissed('CBC-85025')).toBe(true)
  })

  it('does not session-dismiss a different procedure ref', () => {
    render(
      <LearningNotification
        trigger={trigger}
        procedureRef="CBC-85025"
        onStart={onStart}
        onDismiss={onDismiss}
      />
    )

    fireEvent.click(screen.getByTestId('learning-notification-dismiss'))
    expect(isSessionDismissed('UA-81001')).toBe(false)
  })

  it('shows the trigger reason label', () => {
    render(
      <LearningNotification
        trigger={{ ...trigger, type: 'skill_decay' }}
        procedureRef="CBC-85025"
        onStart={onStart}
        onDismiss={onDismiss}
      />
    )

    expect(screen.getByText(/while since/)).toBeDefined()
  })

  it('has role=alert for screen readers', () => {
    render(
      <LearningNotification
        trigger={trigger}
        procedureRef="CBC-85025"
        onStart={onStart}
        onDismiss={onDismiss}
      />
    )

    const el = screen.getByRole('alert')
    expect(el).toBeDefined()
  })
})
