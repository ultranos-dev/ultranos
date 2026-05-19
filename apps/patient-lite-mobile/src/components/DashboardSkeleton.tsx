import { useEffect, useRef } from 'react'
import { View, Animated, StyleSheet } from 'react-native'
import {
  consumerSpacing,
  consumerBorderRadius,
} from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'

function SkeletonBox({ width, height, style, backgroundColor }: { width: number | string; height: number; style?: object; backgroundColor: string }) {
  const opacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    )
    animation.start()
    return () => animation.stop()
  }, [opacity])

  return (
    <Animated.View
      style={[
        styles.skeletonBox,
        { width, height, opacity, backgroundColor },
        style,
      ]}
    />
  )
}

export function DashboardSkeleton() {
  const { colors } = useTheme()

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="dashboard-skeleton">
      {/* Allergy skeleton */}
      <SkeletonBox width="100%" height={72} backgroundColor={colors.skeleton} />

      {/* Summary card skeleton */}
      <View style={[styles.summaryRow, { backgroundColor: colors.surfaceElevated }]}>
        <SkeletonBox width={56} height={56} style={styles.circle} backgroundColor={colors.skeleton} />
        <View style={styles.summaryLines}>
          <SkeletonBox width="70%" height={20} backgroundColor={colors.skeleton} />
          <SkeletonBox width="40%" height={16} backgroundColor={colors.skeleton} />
        </View>
      </View>

      {/* QR skeleton */}
      <View style={[styles.qrSkeleton, { backgroundColor: colors.surfaceElevated }]}>
        <SkeletonBox width={220} height={220} backgroundColor={colors.skeleton} />
      </View>

      {/* Medications skeleton */}
      <SkeletonBox width="100%" height={56} backgroundColor={colors.skeleton} />

      {/* Recent activity skeleton */}
      <SkeletonBox width="100%" height={80} backgroundColor={colors.skeleton} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: consumerSpacing.sectionGap,
    gap: consumerSpacing.sectionGap,
  },
  skeletonBox: {
    borderRadius: consumerBorderRadius.card,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding,
  },
  circle: {
    borderRadius: 28,
  },
  summaryLines: {
    flex: 1,
    gap: 8,
  },
  qrSkeleton: {
    alignItems: 'center',
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding,
    alignSelf: 'center',
  },
})
