/**
 * Story 18.11 Task 3: Theme Toggle — Three-option segmented control.
 *
 * Options: Light (sun), Dark (moon), System (phone)
 * Active option highlighted with brand color.
 * Placed in Profile/Settings section of the Home dashboard.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type ThemeMode } from '@/theme/ThemeProvider'
import { consumerBorderRadius, consumerTypography, consumerSpacing } from '@/theme/consumer'

interface ThemeOption {
  mode: ThemeMode
  icon: string
  labelKey: string
}

const THEME_OPTIONS: ThemeOption[] = [
  { mode: 'light', icon: '\u2600\uFE0F', labelKey: 'settings.light' },   // sun
  { mode: 'dark', icon: '\uD83C\uDF19', labelKey: 'settings.dark' },     // moon
  { mode: 'system', icon: '\uD83D\uDCF1', labelKey: 'settings.system' }, // phone
]

export function ThemeToggle() {
  const { t } = useTranslation()
  const { mode, setMode, colors } = useTheme()

  return (
    <View testID="theme-toggle">
      <Text
        style={[styles.label, { color: colors.textMuted }]}
        accessibilityRole="header"
      >
        {t('settings.appearance')}
      </Text>
      <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        {THEME_OPTIONS.map((option) => {
          const isActive = mode === option.mode

          return (
            <Pressable
              key={option.mode}
              onPress={() => setMode(option.mode)}
              style={[
                styles.segment,
                isActive && [styles.segmentActive, { backgroundColor: colors.primary[500] }],
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={t('settings.themeAccessibility', { mode: t(option.labelKey) })}
              testID={`theme-option-${option.mode}`}
            >
              <Text style={styles.segmentIcon}>{option.icon}</Text>
              <Text
                style={[
                  styles.segmentLabel,
                  { color: isActive ? colors.onPrimary : colors.textSecondary },
                ]}
              >
                {t(option.labelKey)}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  label: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: consumerBorderRadius.button,
    borderWidth: 1,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    minHeight: consumerSpacing.touchTarget,
  },
  segmentActive: {
    borderRadius: consumerBorderRadius.button - 1,
  },
  segmentIcon: {
    fontSize: 16,
    writingDirection: 'ltr',
  },
  segmentLabel: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
})
