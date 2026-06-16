import { type ReactNode } from 'react'
import { Animated, View, RefreshControl, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Spacing } from '../tokens.native'
import { useThemeColors } from './theme'
import { LargeTitle, CompactBar, useCollapsibleHeader } from './collapsible-parts'

interface CollapsibleScreenProps {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  refreshing?: boolean
  onRefresh?: () => void
  testID?: string
}

export function CollapsibleScreen({ title, subtitle, action, children, refreshing, onRefresh, testID }: CollapsibleScreenProps) {
  const colors = useThemeColors()
  const { scrollY, onScroll, headerHeight, onHeaderLayout } = useCollapsibleHeader()
  return (
    <SafeAreaView edges={['top']} testID={testID} style={[styles.root, { backgroundColor: colors.surfaceSubtle }]}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.content}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary500} /> : undefined}
      >
        <LargeTitle title={title} subtitle={subtitle} action={action} onLayout={onHeaderLayout} />
        <View style={styles.body}>{children}</View>
      </Animated.ScrollView>
      <CompactBar title={title} scrollY={scrollY} headerHeight={headerHeight} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: Spacing[8] },
  body: { paddingHorizontal: Spacing[4], gap: Spacing[4] },
})
