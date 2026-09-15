/**
 * NotificationToaster — urgent flag tests (review finding #3)
 *
 * Verifies that:
 *  - LAB_RESULT_ESCALATION notifications trigger notify() with urgent: true
 *  - Other notification types trigger notify() with urgent: false
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace: string) => (key: string) => {
    const MAP: Record<string, string> = {
      'notifications.sourceApp.LAB_LITE': 'Lab Lite',
      'notifications.sourceApp.SYSTEM': 'System',
      'notifications.subject.LAB_RESULT_AVAILABLE': 'Lab result available',
      'notifications.subject.LAB_RESULT_ESCALATION': 'Urgent lab result',
      'notifications.viewDetails': 'View Details',
    }
    return MAP[`${namespace}.${key}`] ?? key
  },
}))

const mockNotify = vi.fn()
vi.mock('@ultranos/ui-kit/components/ui/app-toaster', () => ({
  AppToaster: () => null,
  notify: (...args: unknown[]) => mockNotify(...args),
}))

vi.mock('@ultranos/ui-kit/notification-presentation', () => ({
  sourceAppIcon: () => () => null,
  sourceAppNameKey: (app: string) => `sourceApp.${app}`,
  deriveSourceApp: (type: string) => {
    const map: Record<string, string> = {
      LAB_RESULT_AVAILABLE: 'LAB_LITE',
      LAB_RESULT_ESCALATION: 'LAB_LITE',
    }
    return map[type] ?? 'SYSTEM'
  },
}))

// Mock useNotificationPoll so we control what newNotifications are returned
const mockUseNotificationPoll = vi.fn()
vi.mock('@/lib/use-notification-poll', () => ({
  useNotificationPoll: () => mockUseNotificationPoll(),
}))

import { NotificationToaster } from '../components/NotificationToaster'

// ── Tests ──────────────────────────────────────────────────────────────────

describe('NotificationToaster — urgent flag (review finding #3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls notify() with urgent: true for LAB_RESULT_ESCALATION', () => {
    mockUseNotificationPoll.mockReturnValue({
      newNotifications: [
        {
          id: 'esc-1',
          type: 'LAB_RESULT_ESCALATION',
          sourceApp: 'LAB_LITE',
          subjectKey: 'LAB_RESULT_ESCALATION',
          status: 'SENT',
          createdAt: new Date().toISOString(),
          payload: { testCategory: 'CBC' },
        },
      ],
    })

    render(<NotificationToaster />)

    expect(mockNotify).toHaveBeenCalledTimes(1)
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ urgent: true }),
    )
  })

  it('calls notify() with urgent: false for LAB_RESULT_AVAILABLE', () => {
    mockUseNotificationPoll.mockReturnValue({
      newNotifications: [
        {
          id: 'avail-1',
          type: 'LAB_RESULT_AVAILABLE',
          sourceApp: 'LAB_LITE',
          subjectKey: 'LAB_RESULT_AVAILABLE',
          status: 'SENT',
          createdAt: new Date().toISOString(),
          payload: { testCategory: 'CBC' },
        },
      ],
    })

    render(<NotificationToaster />)

    expect(mockNotify).toHaveBeenCalledTimes(1)
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ urgent: false }),
    )
  })

  it('does not call notify() when there are no new notifications', () => {
    mockUseNotificationPoll.mockReturnValue({ newNotifications: [] })

    render(<NotificationToaster />)

    expect(mockNotify).not.toHaveBeenCalled()
  })
})
