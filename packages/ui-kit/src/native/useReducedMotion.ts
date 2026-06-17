import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * Tracks the OS "reduce motion" accessibility setting.
 * Use to gate autonomous animations (entry/exit fades, springs, looping
 * shimmers, timed transitions). Scroll-linked, user-controlled motion is
 * WCAG-exempt and need not be gated.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (mounted) setReduced(v) })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => { mounted = false; sub?.remove?.() }
  }, [])
  return reduced
}
