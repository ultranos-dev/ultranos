// src/components/DrugDetail/SafetyBanner.tsx
import { View, Text, StyleSheet } from 'react-native'
import { AlertTriangle } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import type { DrugInteraction } from '@ultranos/shared-types'

export function SafetyBanner({ interactions }: { interactions: DrugInteraction[] }) {
  const colors = useThemeColors()
  const contraindicated = interactions.filter((i) => i.severity === 'CONTRAINDICATED')
  const major = interactions.filter((i) => i.severity === 'MAJOR')

  if (contraindicated.length === 0 && major.length === 0) return null

  return (
    <View accessibilityRole="alert" style={styles.wrapper}>
      {contraindicated.length > 0 && (
        <View style={[styles.banner, { backgroundColor: colors.dangerLight }]}>
          <AlertTriangle size={18} color={colors.dangerDark} />
          <View style={styles.textContainer}>
            <Text style={[styles.title, { color: colors.dangerDark }]}>
              Contraindicated interactions
            </Text>
            {contraindicated.map((item, i) => (
              <Text key={i} style={[styles.detail, { color: colors.dangerDark }]}>
                {item.drugName}: {item.mechanism}
              </Text>
            ))}
          </View>
        </View>
      )}
      {major.length > 0 && (
        <View style={[styles.banner, { backgroundColor: colors.warningLight }]}>
          <AlertTriangle size={18} color={colors.warningDark} />
          <View style={styles.textContainer}>
            <Text style={[styles.title, { color: colors.warningDark }]}>
              Major interactions
            </Text>
            {major.map((item, i) => (
              <Text key={i} style={[styles.detail, { color: colors.warningDark }]}>
                {item.drugName}: {item.mechanism}
              </Text>
            ))}
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing[4],
    marginTop: Spacing[2],
    gap: Spacing[2],
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing[3],
    gap: Spacing[2],
    borderRadius: Radius.md,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sansBold,
    marginBottom: Spacing[1],
  },
  detail: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.sans,
    lineHeight: 18,
  },
})
