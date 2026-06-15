// src/components/DrugDetail/SafetyBanner.tsx
import { View, Text, StyleSheet } from 'react-native'
import { AlertTriangle } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

interface Interaction {
  drugName: string
  severity: 'CONTRAINDICATED' | 'MAJOR' | 'MODERATE' | 'MINOR'
  description: string
}

export function SafetyBanner({ interactions }: { interactions: Interaction[] }) {
  const colors = useThemeColors()
  const contraindicated = interactions.filter((i) => i.severity === 'CONTRAINDICATED')

  if (contraindicated.length === 0) return null

  return (
    <View
      style={[styles.banner, { backgroundColor: colors.dangerLight }]}
      accessibilityRole="alert"
    >
      <AlertTriangle size={18} color={colors.dangerDark} />
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: colors.dangerDark }]}>
          Contraindicated interactions
        </Text>
        {contraindicated.map((item, i) => (
          <Text key={i} style={[styles.detail, { color: colors.dangerDark }]}>
            {item.drugName}: {item.description}
          </Text>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing[3],
    gap: Spacing[2],
    borderRadius: Radius.md,
    marginHorizontal: Spacing[4],
    marginTop: Spacing[2],
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
