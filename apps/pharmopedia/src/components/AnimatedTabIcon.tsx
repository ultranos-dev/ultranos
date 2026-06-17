import { useEffect } from 'react'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import type { LucideIcon } from 'lucide-react-native'
import { useReducedMotion } from '@ultranos/ui-kit/native'

interface Props {
  icon: LucideIcon
  color: string
  size: number
  focused: boolean
}

// How far an inactive icon sits below its active resting position. When a tab
// becomes active the icon glides up into place; the label fades in beneath it.
const LIFT = 5
// Smooth, low-bounce settle so the icon eases into place rather than snapping.
const SPRING = { mass: 0.6, damping: 16, stiffness: 170 }

/**
 * Tab bar icon that glides smoothly into place on focus: inactive icons rest
 * slightly lower, and the active icon springs up to its resting position. Pure
 * vertical motion — no fill, no scale pop. Respects the OS "reduce motion"
 * setting (renders static, no glide).
 */
export function AnimatedTabIcon({ icon: Icon, color, size, focused }: Props) {
  const reduced = useReducedMotion()
  const progress = useSharedValue(focused ? 1 : 0)

  useEffect(() => {
    progress.value = reduced ? (focused ? 1 : 0) : withSpring(focused ? 1 : 0, SPRING)
  }, [focused, reduced, progress])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * LIFT }],
  }))

  if (reduced) {
    return <Icon color={color} size={size} />
  }

  return (
    <Animated.View style={animatedStyle}>
      <Icon color={color} size={size} />
    </Animated.View>
  )
}
