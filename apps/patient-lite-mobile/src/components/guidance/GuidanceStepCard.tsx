/**
 * GuidanceStepCard — Single numbered action step for guidance display.
 *
 * Story 53.7 — AC: 10
 *
 * Low-literacy design:
 *   - Large icon (universally recognizable)
 *   - Step number prominently displayed
 *   - Large text (≥ 18pt body)
 *   - RTL-aware layout
 *
 * No PHI — displays static physician-authored guidance text only.
 */
import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'

// Icon symbol mapping — simple emoji characters that render reliably on all
// Android/iOS versions without external icon libraries. Each maps to a step
// icon identifier from GuidanceContent.steps[].icon.
const STEP_ICONS: Record<string, string> = {
  medicine: '💊',
  bed:      '🛏️',
  family:   '👨‍👩‍👧‍👦',
  water:    '💧',
  mask:     '😷',
  air:      '🌬️',
  calendar: '📅',
  doctor:   '🩺',
  noShare:  '🚫',
  noAlcohol:'🚫',
  food:     '🥦',
  rest:     '💤',
  confidential: '🔒',
  counselor: '🤝',
  default:  '✔️',
}

interface GuidanceStepCardProps {
  stepNumber: number
  icon: string
  text: string
  isRTL?: boolean
}

export function GuidanceStepCard({ stepNumber, icon, text, isRTL = false }: GuidanceStepCardProps) {
  const { colors } = useTheme()
  const emoji = STEP_ICONS[icon] ?? STEP_ICONS.default

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
        isRTL && styles.containerRTL,
      ]}
      accessibilityRole="text"
    >
      {/* Step number badge */}
      <View style={[styles.numberBadge, { backgroundColor: colors.primary[600] }]}>
        <Text style={styles.numberText}>{stepNumber}</Text>
      </View>

      {/* Icon */}
      <Text style={styles.icon}>{emoji}</Text>

      {/* Step text */}
      <Text
        style={[styles.stepText, { color: colors.textPrimary }]}
        writingDirection={isRTL ? 'rtl' : 'ltr'}
      >
        {text}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  containerRTL: {
    flexDirection: 'row-reverse',
  },
  numberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  numberText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  icon: {
    fontSize: 24,
    flexShrink: 0,
  },
  stepText: {
    fontSize: 18,       // AC: 10 — minimum 18pt for low-literacy
    lineHeight: 26,
    flex: 1,
    fontWeight: '500',
  },
})
