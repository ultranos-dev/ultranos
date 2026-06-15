import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockImpact, mockNotification, mockSelection } = vi.hoisted(() => ({
  mockImpact: vi.fn(),
  mockNotification: vi.fn(),
  mockSelection: vi.fn(),
}))

vi.mock('expo-haptics', () => ({
  impactAsync: mockImpact,
  notificationAsync: mockNotification,
  selectionAsync: mockSelection,
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
  NotificationFeedbackType: { Success: 'Success', Error: 'Error', Warning: 'Warning' },
}))

import { hapticImpact, hapticNotification, hapticSelection } from '@/lib/haptics'

beforeEach(() => vi.clearAllMocks())

describe('haptics', () => {
  it('hapticImpact calls impactAsync with the given style', async () => {
    await hapticImpact('Light')
    expect(mockImpact).toHaveBeenCalledWith('Light')
  })

  it('hapticNotification calls notificationAsync', async () => {
    await hapticNotification('Success')
    expect(mockNotification).toHaveBeenCalledWith('Success')
  })

  it('hapticSelection calls selectionAsync', async () => {
    await hapticSelection()
    expect(mockSelection).toHaveBeenCalledTimes(1)
  })

  it('swallows errors silently', async () => {
    mockImpact.mockRejectedValueOnce(new Error('Haptics unavailable'))
    // Should not throw
    await hapticImpact('Light')
  })
})
