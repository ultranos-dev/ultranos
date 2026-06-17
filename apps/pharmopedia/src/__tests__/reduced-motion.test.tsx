/**
 * Task 6 — Reduced-motion gate tests
 *
 * Strategy:
 * - Mock `@ultranos/ui-kit/native` to control `useReducedMotion` return value.
 * - The reanimated mock (via vitest alias) renders AnimatedView as a plain View;
 *   it also drops the `entering` prop. So we cannot directly inspect the `entering`
 *   prop. Instead we use two strategies:
 *   (a) Structural: CoachMark wraps the tooltip in an Animated.View when !reduced.
 *       We add a `testID="coach-mark-animated-wrapper"` in the animated branch only.
 *       With reduced=true the wrapper is absent; with reduced=false it is present.
 *   (b) Behavioral: Content is always present (both modes); no crash either way.
 *   (c) SkeletonCard static-fill: when reduced=true the shimmer shared value stays
 *       at the initial value (0) — the useEffect that starts the loop is skipped.
 *       We assert the component renders without crashing and the placeholder is found.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react-native'

// ── Reanimated mock (matches the global alias; kept inline for clarity) ──────
vi.mock('react-native-reanimated', () => {
  const R = require('react')
  const animationStub = new Proxy({}, { get: () => () => animationStub })
  function AnimatedView({ children, style, testID, entering: _e, exiting: _x, ...rest }: {
    children?: React.ReactNode; style?: unknown; testID?: string; entering?: unknown; exiting?: unknown; [k: string]: unknown
  }) {
    return R.createElement('View', { style, testID, ...rest }, children)
  }
  return {
    default: { View: AnimatedView, Text: AnimatedView, createAnimatedComponent: (c: React.ComponentType) => c },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: (fn: () => Record<string, unknown>) => fn(),
    withRepeat: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    Easing: { inOut: (e: unknown) => e, ease: 0 },
    FadeIn: animationStub,
    FadeInUp: animationStub,
    FadeInDown: animationStub,
    FadeOutUp: animationStub,
    FadeOutDown: animationStub,
  }
})

// ── react-native mock ─────────────────────────────────────────────────────────
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

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// ── Control useReducedMotion via a hoisted factory ───────────────────────────
const { mockReducedMotion } = vi.hoisted(() => ({
  mockReducedMotion: vi.fn().mockReturnValue(false),
}))

vi.mock('@ultranos/ui-kit/native', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@ultranos/ui-kit/native')
  return {
    ...actual,
    useReducedMotion: mockReducedMotion,
  }
})

// ── CoachMark deps ────────────────────────────────────────────────────────────
vi.mock('@/store/coach-mark-store', () => ({
  useCoachMarkStore: (selector?: (s: { dismissed: Set<string>; dismiss: (k: string) => void }) => unknown) => {
    const state = { dismissed: new Set<string>(), dismiss: vi.fn(), initialized: true }
    return typeof selector === 'function' ? selector(state) : state
  },
}))

// ── SkeletonCard deps (already covered by react-native mock) ─────────────────

import { CoachMark } from '@/components/CoachMark'
import { SkeletonCard } from '@/components/SkeletonCard'

// ── CoachMark: animated wrapper gating ────────────────────────────────────────
describe('CoachMark — reduce-motion gating', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders hint content when reduce-motion is TRUE (no animation wrapper)', () => {
    mockReducedMotion.mockReturnValue(true)
    render(<CoachMark markKey="rm-test" hint="Tap to learn more" visible />)
    // Content is always present
    expect(screen.getByText('Tap to learn more')).toBeTruthy()
    // The animated-wrapper testID should NOT be present when reduced
    expect(screen.queryByTestId('coach-mark-animated-wrapper')).toBeNull()
  })

  it('renders hint content when reduce-motion is FALSE (animation wrapper present)', () => {
    mockReducedMotion.mockReturnValue(false)
    render(<CoachMark markKey="rm-test2" hint="Tap to learn more" visible />)
    // Content still renders
    expect(screen.getByText('Tap to learn more')).toBeTruthy()
    // The animated-wrapper testID should be present when NOT reduced
    expect(screen.getByTestId('coach-mark-animated-wrapper')).toBeTruthy()
  })

  it('does not crash with either mode', () => {
    for (const v of [true, false]) {
      mockReducedMotion.mockReturnValue(v)
      expect(() =>
        render(<CoachMark markKey={`rm-crash-${v}`} hint="Safe" visible />)
      ).not.toThrow()
    }
  })
})

// ── SkeletonCard: static-fill when reduced ───────────────────────────────────
describe('SkeletonCard — reduce-motion gating', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders placeholder content when reduce-motion is TRUE', () => {
    mockReducedMotion.mockReturnValue(true)
    render(<SkeletonCard testID="skel-reduced" />)
    expect(screen.getByTestId('skel-reduced')).toBeTruthy()
    // Static fill element is present (testID="skel-static")
    expect(screen.getByTestId('skel-static')).toBeTruthy()
  })

  it('renders shimmer variant when reduce-motion is FALSE', () => {
    mockReducedMotion.mockReturnValue(false)
    render(<SkeletonCard testID="skel-anim" />)
    expect(screen.getByTestId('skel-anim')).toBeTruthy()
    // No static element in animated mode
    expect(screen.queryByTestId('skel-static')).toBeNull()
  })
})
