import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react-native'

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('react-native-reanimated', () => {
  const React = require('react')
  return {
    default: {
      createAnimatedComponent: (c: React.ComponentType) => c,
      View: 'View',
    },
    useSharedValue: () => ({ value: 0 }),
    useAnimatedStyle: (fn: () => Record<string, unknown>) => fn(),
    withTiming: (v: number) => v,
    FadeInDown: { duration: () => ({ build: () => ({}) }) },
    FadeOutUp: { duration: () => ({ build: () => ({}) }) },
  }
})

const { mockUseNetInfo } = vi.hoisted(() => ({
  mockUseNetInfo: vi.fn(),
}))
vi.mock('@react-native-community/netinfo', () => ({
  useNetInfo: mockUseNetInfo,
}))

import { NetStatusBanner } from '@/components/NetStatusBanner'

describe('NetStatusBanner', () => {
  beforeEach(() => {
    mockUseNetInfo.mockReset()
  })

  it('renders offline message when not connected', () => {
    mockUseNetInfo.mockReturnValue({ isConnected: false })
    render(<NetStatusBanner />)
    expect(screen.getByText('net.offline')).toBeTruthy()
  })

  it('renders nothing when connected', () => {
    mockUseNetInfo.mockReturnValue({ isConnected: true })
    render(<NetStatusBanner />)
    expect(screen.queryByText('net.offline')).toBeNull()
  })

  it('renders nothing when connection status is null (loading)', () => {
    mockUseNetInfo.mockReturnValue({ isConnected: null })
    render(<NetStatusBanner />)
    expect(screen.queryByText('net.offline')).toBeNull()
  })
})
