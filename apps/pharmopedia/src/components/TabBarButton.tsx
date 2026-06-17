import { useCallback } from 'react'
import { Pressable } from 'react-native'
import type { GestureResponderEvent, StyleProp, ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useReducedMotion } from '@ultranos/ui-kit/native'
import { hapticSelection } from '@/lib/haptics'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

// Snap back from the pressed state with a quick, near-critically-damped spring
// so release always feels instant (slow to press is never the goal here).
const RELEASE_SPRING = { mass: 0.5, damping: 12, stiffness: 280 }

/**
 * Props passed by React Navigation's BottomTabItem to a custom `tabBarButton`.
 * The navigator supplies the full layout `style` (flex + centering) and the
 * `children` (icon + label), plus extra runtime props (role, href on web) that
 * we forward verbatim via `...rest`.
 */
type PressHandler = ((e: GestureResponderEvent) => void) | null

interface Props {
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
  accessibilityState?: { selected?: boolean }
  onPress?: PressHandler
  onPressIn?: PressHandler
  onPressOut?: PressHandler
  onLongPress?: PressHandler
  testID?: string
}

/**
 * Replaces the default tab button to add press feedback: the tab scales down
 * briefly while held, confirming the interface heard the tap, then springs
 * back on release. A light selection haptic fires only when switching to a
 * different tab (not when re-pressing the active one). All motion is gated by
 * the OS "reduce motion" setting.
 */
export function TabBarButton({ children, style, onPress, onPressIn, onPressOut, accessibilityState, ...rest }: Props) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      if (!reduced) scale.value = withTiming(0.9, { duration: 90 })
      onPressIn?.(e)
    },
    [reduced, scale, onPressIn],
  )

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      if (!reduced) scale.value = withSpring(1, RELEASE_SPRING)
      onPressOut?.(e)
    },
    [reduced, scale, onPressOut],
  )

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      if (!accessibilityState?.selected) void hapticSelection()
      onPress?.(e)
    },
    [accessibilityState?.selected, onPress],
  )

  return (
    <AnimatedPressable
      {...rest}
      accessibilityState={accessibilityState}
      style={[style, animatedStyle]}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      {children}
    </AnimatedPressable>
  )
}
