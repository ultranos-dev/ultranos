import { useRef, useState, type ReactNode } from 'react'
import { Animated, View, Text, StyleSheet, type LayoutChangeEvent } from 'react-native'
import { FontFamily, FontSize, Spacing } from '../tokens.native'
import { useThemeColors, useRtl } from './theme'
import { ScreenHeader } from './ScreenHeader'

/** Fallback large-title height used before the real height is measured. */
export const LARGE_TITLE_HEIGHT = 60

/**
 * Owns the scroll offset Animated.Value + onScroll handler, and the measured
 * large-title height that drives the compact-bar cross-fade. Measuring (rather
 * than assuming a fixed height) keeps the fade correct when the title wraps,
 * the OS font scales, or a subtitle is present.
 */
export function useCollapsibleHeader() {
  const scrollY = useRef(new Animated.Value(0)).current
  const [headerHeight, setHeaderHeight] = useState(LARGE_TITLE_HEIGHT)
  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true },
  )
  const onHeaderLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height
    if (h > 0 && h !== headerHeight) setHeaderHeight(h)
  }
  return { scrollY, onScroll, headerHeight, onHeaderLayout }
}

/**
 * The large title that scrolls with content (rendered as the first scrolling
 * element). Delegates the title/subtitle/action row to ScreenHeader (single
 * source of truth for header layout, RTL, and a11y) with reduced padding, and
 * reports its measured height via onLayout.
 */
export function LargeTitle({
  title, subtitle, action, onLayout,
}: { title: string; subtitle?: string; action?: ReactNode; onLayout?: (e: LayoutChangeEvent) => void }) {
  return (
    <View onLayout={onLayout}>
      <ScreenHeader title={title} subtitle={subtitle} action={action} paddingTop={Spacing[2]} paddingBottom={Spacing[3]} />
    </View>
  )
}

/** The compact sticky bar that fades in as the large title scrolls away. */
export function CompactBar({
  title, scrollY, headerHeight = LARGE_TITLE_HEIGHT,
}: { title: string; scrollY: Animated.Value; headerHeight?: number }) {
  const colors = useThemeColors()
  const rtl = useRtl()
  const opacity = scrollY.interpolate({
    inputRange: [headerHeight * 0.5, headerHeight],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.compact, { backgroundColor: colors.surfaceElevated, borderBottomColor: colors.borderSubtle, opacity }]}
    >
      <Text numberOfLines={1} style={[styles.compactTitle, { color: colors.textPrimary, textAlign: rtl ? 'right' : 'left' }, rtl && styles.arabic]}>
        {title}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  arabic: { fontFamily: FontFamily.arabic },
  compact: { position: 'absolute', top: 0, left: 0, right: 0, height: 52, justifyContent: 'center', paddingHorizontal: Spacing[4], borderBottomWidth: StyleSheet.hairlineWidth },
  compactTitle: { fontFamily: FontFamily.sansBold, fontSize: FontSize.base },
})
