import { Children, isValidElement, type ReactNode } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { FontFamily, FontSize, Radius, Spacing, Shadow } from '../tokens.native'
import { useThemeColors, useRtl } from './theme'

interface CardProps {
  children: ReactNode
  padded?: boolean
  testID?: string
}

export function Card({ children, padded = false, testID }: CardProps) {
  const colors = useThemeColors()
  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, padded && styles.padded]}
    >
      {children}
    </View>
  )
}

interface CardSectionProps {
  label?: string
  children: ReactNode
}

export function CardSection({ label, children }: CardSectionProps) {
  const colors = useThemeColors()
  const rtl = useRtl()
  const items = Children.toArray(children)
  return (
    <View style={styles.section}>
      {label ? (
        <Text style={[styles.label, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>{label}</Text>
      ) : null}
      <Card>
        {items.map((child, i) => {
          const key = isValidElement(child) && child.key != null ? child.key : i
          return (
            <View key={key}>
              {i > 0 ? <View testID="card-divider" style={[styles.divider, { backgroundColor: colors.borderSubtle }]} /> : null}
              {child}
            </View>
          )
        })}
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', ...Shadow.sm },
  padded: { padding: Spacing[4] },
  section: { marginBottom: Spacing[4] },
  label: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: Spacing[2],
    marginHorizontal: Spacing[1],
  },
  divider: { height: StyleSheet.hairlineWidth },
})
