import { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

interface Props {
  testID?: string
  lines?: number
}

export function SkeletonCard({ testID, lines = 2 }: Props) {
  const colors = useThemeColors()
  const shimmer = useSharedValue(0)

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    )
  }, [shimmer])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + shimmer.value * 0.6,
  }))

  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: colors.surface, borderBottomColor: colors.borderSubtle }]}
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={[styles.titleLine, { backgroundColor: colors.surfaceSubtle }, animatedStyle]}
      />
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bodyLine,
            { backgroundColor: colors.surfaceSubtle, width: i === lines - 2 ? '60%' : '85%' },
            animatedStyle,
          ]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing[4],
    borderBottomWidth: 1,
  },
  titleLine: {
    height: 16,
    borderRadius: Radius.sm,
    width: '70%',
    marginBottom: Spacing[2],
  },
  bodyLine: {
    height: 12,
    borderRadius: Radius.sm,
    marginTop: Spacing[1],
  },
})
