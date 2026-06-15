import { View, Text, StyleSheet } from 'react-native'
import { FontFamily, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'

// Role-specific palette kept intentionally distinct for quick visual differentiation
const ROLE_COLORS: Record<string, string> = {
  PATIENT:    '#dbeafe', DOCTOR:    '#dcfce7', NURSE:      '#dcfce7',
  LAB_TECH:   '#fef3c7', PHARMACIST: '#f3e8ff', ADMIN:     '#fee2e2',
}
const ROLE_TEXT_COLORS: Record<string, string> = {
  PATIENT:    '#1d4ed8', DOCTOR:    '#15803d', NURSE:      '#15803d',
  LAB_TECH:   '#92400e', PHARMACIST: '#7e22ce', ADMIN:     '#b91c1c',
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: ROLE_COLORS[role] ?? '#f3f4f6' }]}>
      <Text style={[styles.text, { color: ROLE_TEXT_COLORS[role] ?? '#374151' }]}>
        {role}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing[2] + 2,
    paddingVertical: 4,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 12, fontFamily: FontFamily.sansSemibold },
})
