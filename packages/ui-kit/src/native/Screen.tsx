import { type ReactNode } from 'react'
import { ScrollView, View, StyleSheet } from 'react-native'
import { SafeAreaView, type Edge } from 'react-native-safe-area-context'
import { Spacing } from '../tokens.native'
import { useThemeColors } from './theme'

interface ScreenProps {
  children: ReactNode
  scroll?: boolean
  edges?: Edge[]
  padded?: boolean
  testID?: string
}

export function Screen({ children, scroll = false, edges = ['top'], padded = true, testID }: ScreenProps) {
  const colors = useThemeColors()
  const inner = padded ? <View style={styles.padded}>{children}</View> : children
  return (
    <SafeAreaView edges={edges} testID={testID} style={[styles.root, { backgroundColor: colors.surfaceSubtle }]}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll}>{inner}</ScrollView> : inner}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  padded: { flex: 1, paddingHorizontal: Spacing[4] },
  scroll: { paddingBottom: Spacing[8] },
})
