import { View, Text, StyleSheet } from 'react-native'
import { consumerColors, consumerBorderRadius } from '@/theme/consumer'
import type { IconCategory } from '@/lib/fhir-humanizer'

/**
 * Semantic icon mapping — uses emoji as cross-platform accessible icons.
 * Each icon has an accessibility label for screen readers.
 *
 * Medical icons do NOT mirror in RTL (per CLAUDE.md RTL Support rules).
 */
const ICON_MAP: Record<IconCategory, { emoji: string; label: string }> = {
  stethoscope: { emoji: '🩺', label: 'Doctor visit' },
  pill: { emoji: '💊', label: 'Medicine' },
  lungs: { emoji: '🫁', label: 'Breathing' },
  heart: { emoji: '❤️', label: 'Heart' },
  bone: { emoji: '🦴', label: 'Bone or joint' },
  brain: { emoji: '🧠', label: 'Mental health' },
  eye: { emoji: '👁️', label: 'Eye' },
  tooth: { emoji: '🦷', label: 'Dental' },
  baby: { emoji: '🤰', label: 'Pregnancy' },
  syringe: { emoji: '💉', label: 'Injection' },
  bandage: { emoji: '🩹', label: 'Injury or skin' },
  thermometer: { emoji: '🌡️', label: 'General health' },
  clipboard: { emoji: '📋', label: 'Health record' },
}

interface TimelineIconProps {
  icon: IconCategory
  isActive?: boolean
  testID?: string
}

const FALLBACK_ICON = { emoji: '📋', label: 'Health record' }

export function TimelineIcon({ icon, isActive, testID }: TimelineIconProps) {
  const mapping = ICON_MAP[icon] ?? FALLBACK_ICON

  return (
    <View
      style={[
        styles.container,
        isActive ? styles.active : styles.inactive,
      ]}
      accessibilityRole="image"
      accessibilityLabel={mapping.label}
      testID={testID}
    >
      <Text style={styles.emoji}>{mapping.emoji}</Text>
    </View>
  )
}

const ICON_SIZE = 48

const styles = StyleSheet.create({
  container: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  active: {
    backgroundColor: consumerColors.secondary[50],
    borderColor: consumerColors.secondary[400],
  },
  inactive: {
    backgroundColor: consumerColors.primary[50],
    borderColor: consumerColors.primary[200],
  },
  emoji: {
    fontSize: 22,
    // Prevent RTL mirroring on medical icons
    writingDirection: 'ltr',
  },
})
