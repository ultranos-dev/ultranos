import { useState, type ReactNode } from 'react'
import { View, Text, Pressable, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native'
import { ChevronDown } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing, Radius } from '../tokens.native'
import { useThemeColors, useRtl } from './theme'
import { useReducedMotion } from './useReducedMotion'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

interface CollapsibleSectionProps {
  title: string
  defaultOpen?: boolean
  badge?: string
  children: ReactNode
  testID?: string
}

export function CollapsibleSection({ title, defaultOpen = false, badge, children, testID }: CollapsibleSectionProps) {
  const colors = useThemeColors()
  const rtl = useRtl()
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(defaultOpen)

  function toggle() {
    if (!reduced && LayoutAnimation?.configureNext) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setOpen((o) => !o)
  }

  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable
        testID={testID}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        style={[styles.header, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
      >
        <Text style={[styles.title, { color: colors.textPrimary, textAlign: rtl ? 'right' : 'left' }, rtl && styles.arabic]}>
          {title}
        </Text>
        {badge ? <Text style={[styles.badge, { color: colors.textMuted }]}>{badge}</Text> : null}
        <ChevronDown size={20} color={colors.textMuted} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </Pressable>
      {open ? (
        <View testID={testID ? `${testID}-body` : undefined} style={styles.body}>
          {children}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { borderRadius: Radius.md, borderWidth: 1, marginBottom: Spacing[3], overflow: 'hidden' },
  header: { alignItems: 'center', justifyContent: 'space-between', padding: Spacing[4], gap: Spacing[2] },
  title: { flex: 1, fontSize: FontSize.base, fontFamily: FontFamily.sansSemibold },
  badge: { fontSize: FontSize.xs, fontFamily: FontFamily.sans },
  arabic: { fontFamily: FontFamily.arabic },
  body: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[4] },
})
