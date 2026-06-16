import { type ReactNode } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { FontFamily, FontSize, Spacing } from '../tokens.native'
import { useThemeColors, useRtl } from './theme'

interface ScreenHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
  /** Override the default vertical padding (used by the collapsing large title). */
  paddingTop?: number
  paddingBottom?: number
}

export function ScreenHeader({ title, subtitle, action, paddingTop, paddingBottom }: ScreenHeaderProps) {
  const colors = useThemeColors()
  const rtl = useRtl()
  const align = rtl ? ('right' as const) : ('left' as const)
  return (
    <View style={[styles.row, rtl && styles.rowRtl, { paddingTop: paddingTop ?? Spacing[4], paddingBottom: paddingBottom ?? Spacing[2] }]}>
      <View style={styles.titles}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.textPrimary, textAlign: align }, rtl && styles.arabic]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textMuted, textAlign: align }, rtl && styles.arabic]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: Spacing[4], paddingHorizontal: Spacing[4], paddingBottom: Spacing[2] },
  rowRtl: { flexDirection: 'row-reverse' },
  titles: { flex: 1 },
  title: { fontFamily: FontFamily.headingBold, fontSize: FontSize['2xl'] },
  subtitle: { fontFamily: FontFamily.sans, fontSize: FontSize.xs, marginTop: Spacing[1] },
  arabic: { fontFamily: FontFamily.arabic },
  action: { marginStart: Spacing[3] },
})
