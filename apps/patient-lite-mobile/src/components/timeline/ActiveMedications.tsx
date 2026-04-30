import { useState } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native'
import { TimelineIcon } from './TimelineIcon'
import type { TimelineEvent } from '@/hooks/useMedicalHistory'
import {
  consumerColors,
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
  consumerStyles,
} from '@/theme/consumer'

interface ActiveMedicationsProps {
  medications: TimelineEvent[]
}

function ActiveMedCard({ med }: { med: TimelineEvent }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Pressable
      onPress={() => setExpanded((prev) => !prev)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Active medicine: ${med.label}. Tap for details.`}
      testID={`active-med-${med.id}`}
    >
      <TimelineIcon icon={med.icon} isActive />
      <Text style={styles.medLabel} numberOfLines={2}>
        {med.label}
      </Text>
      <View style={styles.activeBadge}>
        <Text style={styles.activeBadgeText}>Active</Text>
      </View>
      {expanded && (
        <View style={styles.detailSection} testID={`active-med-detail-${med.id}`}>
          <Text style={styles.detailText}>{med.label}</Text>
          <Text style={styles.detailDate}>
            Started: {med.date ? new Date(med.date).toLocaleDateString('en-u-ca-gregory', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown'}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

export function ActiveMedications({ medications }: ActiveMedicationsProps) {
  if (medications.length === 0) return null

  return (
    <View style={styles.container} testID="active-medications">
      <Text
        style={consumerStyles.subheaderText}
        accessibilityRole="header"
      >
        Current Care
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        testID="active-medications-list"
      >
        {medications.map((med) => (
          <ActiveMedCard key={med.id} med={med} />
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  scrollContent: {
    gap: 12,
    paddingEnd: consumerSpacing.screenPadding,
  },
  card: {
    backgroundColor: consumerColors.surfaceElevated,
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding,
    alignItems: 'center',
    gap: 8,
    minWidth: 120,
    maxWidth: 160,
    borderWidth: 2,
    borderColor: consumerColors.secondary[200],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardPressed: {
    backgroundColor: consumerColors.secondary[50],
    borderColor: consumerColors.secondary[400],
  },
  medLabel: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
    color: consumerColors.textPrimary,
    textAlign: 'center',
  },
  activeBadge: {
    backgroundColor: 'hsl(160, 60%, 90%)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: consumerBorderRadius.badge,
    borderWidth: 1,
    borderColor: 'hsl(160, 50%, 70%)',
  },
  activeBadgeText: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
    color: 'hsl(160, 60%, 25%)',
  },
  detailSection: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: consumerColors.border,
    gap: 2,
    alignSelf: 'stretch',
  },
  detailText: {
    fontSize: consumerTypography.captionSize,
    color: consumerColors.textPrimary,
    textAlign: 'center',
  },
  detailDate: {
    fontSize: consumerTypography.captionSize,
    color: consumerColors.textMuted,
    textAlign: 'center',
  },
})
