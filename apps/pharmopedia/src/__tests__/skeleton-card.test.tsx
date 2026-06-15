import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'

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
  }
})
vi.mock('react-native-reanimated', () => {
  const React = require('react')
  // Inline View stub — avoids importing react-native (which has Flow syntax)
  // inside the hoisted factory block.
  function AnimatedView({ children, style, testID, ...rest }: {
    children?: React.ReactNode
    style?: unknown
    testID?: string
    [key: string]: unknown
  }) {
    return React.createElement('View', { style, testID, ...rest }, children)
  }
  return {
    default: {
      View: AnimatedView,
      createAnimatedComponent: (c: React.ComponentType) => c,
    },
    useSharedValue: () => ({ value: 0 }),
    useAnimatedStyle: (fn: () => Record<string, unknown>) => fn(),
    withRepeat: (v: number) => v,
    withTiming: (v: number) => v,
    Easing: { inOut: (e: unknown) => e, ease: 0 },
  }
})

import { SkeletonCard } from '@/components/SkeletonCard'

describe('SkeletonCard', () => {
  it('renders with default variant (drug)', () => {
    render(<SkeletonCard testID="skel-1" />)
    expect(screen.getByTestId('skel-1')).toBeTruthy()
  })

  it('renders multiple skeleton lines', () => {
    render(<SkeletonCard testID="skel-1" lines={3} />)
    expect(screen.getByTestId('skel-1')).toBeTruthy()
  })
})
