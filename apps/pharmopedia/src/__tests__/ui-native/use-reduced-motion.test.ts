import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react-native'
const removeFn = vi.fn()
const h = vi.hoisted(() => ({ isReduced: vi.fn(), addListener: vi.fn(() => ({ remove: removeFn })) }))
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    AccessibilityInfo: { isReduceMotionEnabled: h.isReduced, addEventListener: h.addListener },
  }
})
import { useReducedMotion } from '@ultranos/ui-kit/native'

describe('useReducedMotion', () => {
  beforeEach(() => vi.clearAllMocks())
  it('returns false by default', async () => {
    h.isReduced.mockResolvedValue(false)
    const { result } = renderHook(() => useReducedMotion())
    await waitFor(() => expect(result.current).toBe(false))
  })
  it('returns true when the OS reports reduce-motion', async () => {
    h.isReduced.mockResolvedValue(true)
    const { result } = renderHook(() => useReducedMotion())
    await waitFor(() => expect(result.current).toBe(true))
    expect(h.addListener).toHaveBeenCalledWith('reduceMotionChanged', expect.any(Function))
  })
  it('calls subscription.remove() on unmount', async () => {
    h.isReduced.mockResolvedValue(false)
    const { unmount } = renderHook(() => useReducedMotion())
    await waitFor(() => expect(h.addListener).toHaveBeenCalled())
    unmount()
    expect(removeFn).toHaveBeenCalledTimes(1)
  })
})
