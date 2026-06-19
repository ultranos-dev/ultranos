import { useState, type ReactNode } from 'react'
import { View, Text, Pressable, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native'
import { ChevronRight, ChevronDown, ChevronLeft } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing } from '../tokens.native'
import { useThemeColors, useRtl } from './theme'
import { useReducedMotion } from './useReducedMotion'
import { Card } from './Card'

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

/**
 * Edge-to-edge collapsible section that mirrors the Saved-tab card rhythm:
 * a flush `Card square` (hairline border, subtle shadow, no rounded corners),
 * with a single-line header row (title + right-chevron) that toggles the body
 * in place. The chevron points to the start edge when closed and rotates down
 * when open; RTL is honored for both layout and chevron direction.
 */
export function CollapsibleSection({ title, defaultOpen = false, badge, children, testID }: CollapsibleSectionProps) {
  const colors = useThemeColors()
  const rtl = useRtl()
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(defaultOpen)

  function toggle() {
    if (!reduced && LayoutAnimation?.configureNext) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setOpen((o) => !o)
  }

  // Swap the icon rather than rotate it (rotation rendered unreliably): closed points to the
  // start edge (right in LTR, left in RTL); open shows an explicit down-chevron.
  const Chevron = open ? ChevronDown : rtl ? ChevronLeft : ChevronRight

  return (
    <Card square>
      <Pressable
        testID={testID}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        style={({ pressed }) => [
          styles.header,
          { flexDirection: rtl ? 'row-reverse' : 'row' },
          pressed && { backgroundColor: colors.surfaceSubtle },
        ]}
      >
        <Text
          style={[styles.title, { color: colors.textPrimary, textAlign: rtl ? 'right' : 'left' }, rtl && styles.arabic]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {badge ? <Text style={[styles.badge, { color: colors.textMuted }]}>{badge}</Text> : null}
        <Chevron size={20} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View testID={testID ? `${testID}-body` : undefined}>
          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
          <View style={styles.body}>{children}</View>
        </View>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', justifyContent: 'space-between', gap: Spacing[2], minHeight: 52, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  title: { flex: 1, fontSize: FontSize.base, fontFamily: FontFamily.sansSemibold },
  badge: { fontSize: FontSize.xs, fontFamily: FontFamily.sans },
  arabic: { fontFamily: FontFamily.arabic },
  divider: { height: StyleSheet.hairlineWidth },
  body: { paddingHorizontal: Spacing[4], paddingTop: Spacing[3], paddingBottom: Spacing[4] },
})
