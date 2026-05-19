/**
 * Story 11.7 Task 3: Color-coded health cards (AC #4).
 *
 * Three variants:
 * - allergy: red + warning icon
 * - medication: blue + pill icon
 * - consent: green + shield icon
 *
 * Color is NOT the only differentiator: icon + color + position all contribute.
 * Minimum 72px height, tappable, with clear visual hierarchy.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { HEALTH_CARD_STYLES, type HealthCardVariant } from '@/config/icon-vocabulary'
import { LongPressTooltip } from './LongPressTooltip'
import { consumerTypography, consumerBorderRadius } from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'

interface PatientHealthCardProps {
  variant: HealthCardVariant
  title: string
  subtitle?: string
  onPress?: () => void
  testID?: string
}

export function PatientHealthCard({
  variant,
  title,
  subtitle,
  onPress,
  testID,
}: PatientHealthCardProps) {
  const { t } = useTranslation()
  const { healthCards, colors } = useTheme()
  const style = HEALTH_CARD_STYLES[variant]
  const themedColors = healthCards[variant]

  const content = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: themedColors.backgroundColor,
          borderColor: themedColors.borderColor,
        },
      ]}
      accessibilityRole={onPress ? 'button' : 'none'}
      accessibilityLabel={`${t(style.labelKey)}: ${title}${subtitle ? `, ${subtitle}` : ''}`}
      testID={testID}
    >
      <LongPressTooltip tooltip={t(style.labelKey)}>
        <View style={[styles.iconCircle, { backgroundColor: themedColors.iconBgColor }]}>
          <Text style={[styles.icon, { color: themedColors.iconColor }]}>
            {style.emoji}
          </Text>
        </View>
      </LongPressTooltip>
      <View style={styles.content}>
        <Text style={[styles.title, { color: themedColors.iconColor }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle && (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
    </View>
  )

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
        {content}
      </Pressable>
    )
  }

  return content
}

const CARD_MIN_HEIGHT = 72

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: CARD_MIN_HEIGHT,
    borderRadius: consumerBorderRadius.card,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  pressed: {
    opacity: 0.8,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 24,
    // Medical icons do NOT mirror in RTL
    writingDirection: 'ltr',
  },
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
  subtitle: {
    fontSize: consumerTypography.captionSize,
    // color applied inline via colors.textSecondary for dark mode support
  },
})
