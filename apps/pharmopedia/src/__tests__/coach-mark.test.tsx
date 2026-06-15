import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react-native'

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}))
vi.mock('react-native', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-native')
  return {
    ...actual,
    Appearance: {
      getColorScheme: vi.fn(() => 'light'),
      addChangeListener: vi.fn(() => ({ remove: vi.fn() })),
    },
    Modal: ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
      visible ? children : null,
  }
})
vi.mock('react-native-reanimated', () => {
  const React = require('react')
  return {
    default: { createAnimatedComponent: (c: React.ComponentType) => c, View: 'View' },
    useSharedValue: () => ({ value: 0 }),
    useAnimatedStyle: (fn: () => Record<string, unknown>) => fn(),
    withTiming: (v: number) => v,
    FadeIn: { delay: () => ({ duration: () => ({ build: () => ({}) }) }) },
  }
})

import { CoachMark } from '@/components/CoachMark'
import { useCoachMarkStore } from '@/store/coach-mark-store'

beforeEach(() => {
  vi.clearAllMocks()
  useCoachMarkStore.setState({ dismissed: new Set(), initialized: true })
})

describe('CoachMark', () => {
  it('renders hint text when visible', () => {
    render(<CoachMark markKey="test-key" hint="Test hint" visible />)
    expect(screen.getByText('Test hint')).toBeTruthy()
  })

  it('does not render when not visible', () => {
    render(<CoachMark markKey="test-key" hint="Test hint" visible={false} />)
    expect(screen.queryByText('Test hint')).toBeNull()
  })

  it('does not render when already dismissed', () => {
    useCoachMarkStore.setState({ dismissed: new Set(['test-key']) })
    render(<CoachMark markKey="test-key" hint="Test hint" visible />)
    expect(screen.queryByText('Test hint')).toBeNull()
  })

  it('calls dismiss on press', () => {
    const dismissSpy = vi.fn()
    useCoachMarkStore.setState({ dismissed: new Set(), initialized: true, dismiss: dismissSpy })
    render(<CoachMark markKey="test-key" hint="Test hint" visible />)
    fireEvent.press(screen.getByTestId('coach-mark-overlay'))
    expect(dismissSpy).toHaveBeenCalledWith('test-key')
  })
})
