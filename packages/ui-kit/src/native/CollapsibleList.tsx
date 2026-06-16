import { type ReactElement, type ReactNode } from 'react'
import { Animated, FlatList, View, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Spacing } from '../tokens.native'
import { useThemeColors } from './theme'
import { LargeTitle, CompactBar, useCollapsibleHeader } from './collapsible-parts'

// Animated.FlatList is typed without item generics; re-cast to the generic
// FlatList type so `data`/`renderItem` stay type-safe for T.
const AnimatedFlatList = Animated.FlatList as unknown as typeof FlatList

interface CollapsibleListProps<T> {
  title: string
  subtitle?: string
  action?: ReactNode
  subHeader?: ReactNode
  data: T[]
  renderItem: (info: { item: T; index: number }) => ReactElement | null
  keyExtractor: (item: T, index: number) => string
  ListEmptyComponent?: ReactElement
  refreshing?: boolean
  onRefresh?: () => void
  onEndReached?: () => void
  testID?: string
}

export function CollapsibleList<T>({
  title, subtitle, action, subHeader, data, renderItem, keyExtractor,
  ListEmptyComponent, refreshing, onRefresh, onEndReached, testID,
}: CollapsibleListProps<T>) {
  const colors = useThemeColors()
  const { scrollY, onScroll, headerHeight, onHeaderLayout } = useCollapsibleHeader()
  return (
    <SafeAreaView edges={['top']} testID={testID} style={[styles.root, { backgroundColor: colors.surfaceSubtle }]}>
      <AnimatedFlatList
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={
          <View>
            <LargeTitle title={title} subtitle={subtitle} action={action} onLayout={onHeaderLayout} />
            {subHeader ? <View style={styles.subHeader}>{subHeader}</View> : null}
          </View>
        }
        ListEmptyComponent={ListEmptyComponent}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        contentContainerStyle={styles.content}
      />
      <CompactBar title={title} scrollY={scrollY} headerHeight={headerHeight} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: Spacing[8] },
  subHeader: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[2] },
})
